import * as THREE from 'three';
import { normalizeCoordinates } from '../../components/PolygonViewer/utils';
import { Polygon } from '../../components/PolygonViewer/types';
import { NavigationService } from '../../lib/services/NavigationService';

// Extend the Polygon interface to include transport points
interface TransportPolygon extends Polygon {
  bridgePoints?: Array<{
    edge: { lat: number; lng: number };
    connection?: {
      targetPolygonId?: string;
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
  private navigationService: NavigationService;
  private pathMarkers: THREE.Object3D[] = [];

  constructor({ scene, bounds }: TransportPointManagerProps) {
    this.scene = scene;
    this.bounds = bounds;
    this.navigationService = NavigationService.getInstance();
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
      if (polygon.bridgePoints && Array.isArray(polygon.bridgePoints) && polygon.bridgePoints.length > 0) {
        polygon.bridgePoints.forEach((point, index) => {
          try {
            const normalizedCoord = normalizeCoordinates(
              [point.edge],
              this.bounds.centerLat,
              this.bounds.centerLng,
              this.bounds.scale,
              this.bounds.latCorrectionFactor
            )[0];

            // Create a larger marker for the bridge point to make it easier to select
            const geometry = new THREE.SphereGeometry(0.5, 12, 12);

            const marker = new THREE.Mesh(geometry, bridgeMaterial);
            marker.position.set(normalizedCoord.x, 0.2, -normalizedCoord.y);
            marker.renderOrder = 100;

            // Add metadata for tooltips with more robust error checking
            marker.userData = {
              id: `bridge-${polygon.id}-${index}`,
              type: 'bridge',
              polygonId: polygon.id,
              targetPolygonId: point.connection?.targetPolygonId || null,
              position: `${point.edge.lat.toFixed(6)}, ${point.edge.lng.toFixed(6)}`,
              name: point.connection?.historicalName || 'Unnamed Bridge',
              description: point.connection?.historicalDescription || 'No description available'
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

              // Create a line material with increased width and opacity
              const lineMaterial = new THREE.LineBasicMaterial({
                color: 0xFF8800,
                transparent: true,
                opacity: 0.9,
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

            // We still create the water point and line objects but don't add them to the scene
            // This maintains the data structure while hiding the visual elements
            
            // Create a line connecting edge to water (but don't add to scene)
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
            
            // Store the line in our array but don't add it to the scene
            this.dockPointMarkers.push(line);

            // Create a marker for the water point (but don't add to scene)
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
            
            // Store the water marker in our array but don't add it to the scene
            this.dockPointMarkers.push(waterMarker);
          } catch (error) {
            console.error(`Error creating dock point for polygon ${polygon.id}:`, error);
          }
        });
      }
    });

    console.log(`Created ${this.bridgePointMarkers.length} bridge markers and ${this.dockPointMarkers.length} dock markers`);
    
    // Set the polygons in the navigation service
    this.navigationService.setPolygons(polygons);
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
    
    // Clear path markers
    this.clearPathMarkers();
  }

  public setVisible(visible: boolean): void {
    this.bridgePointMarkers.forEach(marker => {
      marker.visible = visible;
    });
    this.dockPointMarkers.forEach(marker => {
      marker.visible = visible;
    });
    this.pathMarkers.forEach(marker => {
      marker.visible = visible;
    });
  }

  public handleHover(raycaster: THREE.Raycaster, onHover: (id: string | null, userData?: any) => void): void {
    // Increase the raycaster's precision for better selection
    raycaster.params.Points = { threshold: 0.5 };
    raycaster.params.Line = { threshold: 0.2 };
    
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

        // Highlight the hovered point with more prominent visual feedback
        if (intersected instanceof THREE.Mesh) {
          // Create a more distinct highlight material
          const highlightMaterial = new THREE.MeshBasicMaterial({
            color: userData.type.startsWith('bridge') ? 0xFFAA00 : 0x00CCFF,
            transparent: true,
            opacity: 1.0,
            // Add emissive property for better visibility
            emissive: userData.type.startsWith('bridge') ? 0xFF8800 : 0x0088CC,
            emissiveIntensity: 0.5
          });

          // Store the original material if not already stored
          if (!intersected.userData.originalMaterial) {
            intersected.userData.originalMaterial = intersected.material;
          }

          // Apply the highlight material
          intersected.material = highlightMaterial;
          
          // Scale up the object slightly for better visual feedback
          intersected.scale.set(1.2, 1.2, 1.2);
        }

        // Call the hover callback
        onHover(userData.id, userData);
      }
    } else if (this.hoveredPointId) {
      // Reset previously hovered point
      const hoveredPoint = [...this.bridgePointMarkers, ...this.dockPointMarkers].find(
        marker => marker instanceof THREE.Mesh && marker.userData && marker.userData.id === this.hoveredPointId
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
        
        // Reset scale
        hoveredPoint.scale.set(1.0, 1.0, 1.0);
      }

      this.hoveredPointId = null;

      // Call the hover callback with null
      onHover(null);
    }
  }

  /**
   * Visualize a path between two polygons
   */
  public visualizePath(startPolygonId: string, endPolygonId: string): void {
    // Clear any existing path markers
    this.clearPathMarkers();
    
    // Find the path using the navigation service
    const path = this.navigationService.findShortestPath(startPolygonId, endPolygonId);
    
    if (path.length < 2) {
      console.log('No path found or path too short');
      return;
    }
    
    console.log(`Visualizing path with ${path.length} nodes: ${path.join(' -> ')}`);
    
    // Get bridge information for the path
    const bridges = this.navigationService.getBridgesForPath(path);
    
    // Create path markers
    const pathMaterial = new THREE.LineBasicMaterial({
      color: 0xFFFF00,
      linewidth: 3,
      transparent: true,
      opacity: 0.8
    });
    
    // Create markers for each polygon in the path
    for (let i = 0; i < path.length; i++) {
      const polygonId = path[i];
      const position = this.navigationService.getNodePosition(polygonId);
      
      if (position) {
        // Normalize the position
        const normalizedPos = normalizeCoordinates(
          [{ lat: position.x, lng: position.z }],
          this.bounds.centerLat,
          this.bounds.centerLng,
          this.bounds.scale,
          this.bounds.latCorrectionFactor
        )[0];
        
        // Create a marker for the polygon
        const geometry = new THREE.SphereGeometry(0.4, 16, 16);
        const material = new THREE.MeshBasicMaterial({
          color: i === 0 ? 0x00FF00 : (i === path.length - 1 ? 0xFF0000 : 0xFFAA00),
          transparent: true,
          opacity: 0.8
        });
        
        const marker = new THREE.Mesh(geometry, material);
        marker.position.set(normalizedPos.x, 0.3, -normalizedPos.y);
        marker.renderOrder = 110;
        
        // Add metadata
        marker.userData = {
          id: `path-node-${polygonId}`,
          type: 'path-node',
          polygonId: polygonId,
          index: i
        };
        
        this.scene.add(marker);
        this.pathMarkers.push(marker);
      }
    }
    
    // Create lines for each bridge in the path
    bridges.forEach((bridge, index) => {
      try {
        if (bridge.sourcePoint && bridge.targetPoint) {
          // Normalize the bridge points
          const sourceCoord = normalizeCoordinates(
            [bridge.sourcePoint],
            this.bounds.centerLat,
            this.bounds.centerLng,
            this.bounds.scale,
            this.bounds.latCorrectionFactor
          )[0];
          
          const targetCoord = normalizeCoordinates(
            [bridge.targetPoint],
            this.bounds.centerLat,
            this.bounds.centerLng,
            this.bounds.scale,
            this.bounds.latCorrectionFactor
          )[0];
          
          // Create a line geometry
          const lineGeometry = new THREE.BufferGeometry();
          const vertices = new Float32Array([
            sourceCoord.x, 0.25, -sourceCoord.y,
            targetCoord.x, 0.25, -targetCoord.y
          ]);
          lineGeometry.setAttribute('position', new THREE.BufferAttribute(vertices, 3));
          
          // Create the line
          const line = new THREE.Line(lineGeometry, pathMaterial);
          line.renderOrder = 105;
          
          this.scene.add(line);
          this.pathMarkers.push(line);
        } else if (bridge.isVirtual) {
          // For virtual bridges, create a line between polygon centroids
          const fromPosition = this.navigationService.getNodePosition(bridge.fromPolygonId);
          const toPosition = this.navigationService.getNodePosition(bridge.toPolygonId);
          
          if (fromPosition && toPosition) {
            // Normalize the positions
            const fromCoord = normalizeCoordinates(
              [{ lat: fromPosition.x, lng: fromPosition.z }],
              this.bounds.centerLat,
              this.bounds.centerLng,
              this.bounds.scale,
              this.bounds.latCorrectionFactor
            )[0];
            
            const toCoord = normalizeCoordinates(
              [{ lat: toPosition.x, lng: toPosition.z }],
              this.bounds.centerLat,
              this.bounds.centerLng,
              this.bounds.scale,
              this.bounds.latCorrectionFactor
            )[0];
            
            // Create a line geometry
            const lineGeometry = new THREE.BufferGeometry();
            const vertices = new Float32Array([
              fromCoord.x, 0.25, -fromCoord.y,
              toCoord.x, 0.25, -toCoord.y
            ]);
            lineGeometry.setAttribute('position', new THREE.BufferAttribute(vertices, 3));
            
            // Create the line with a dashed material for virtual bridges
            const virtualMaterial = new THREE.LineDashedMaterial({
              color: 0xFFFF00,
              linewidth: 2,
              scale: 1,
              dashSize: 0.5,
              gapSize: 0.3,
              transparent: true,
              opacity: 0.6
            });
            
            const line = new THREE.Line(lineGeometry, virtualMaterial);
            line.computeLineDistances(); // Required for dashed lines
            line.renderOrder = 105;
            
            this.scene.add(line);
            this.pathMarkers.push(line);
          }
        }
      } catch (error) {
        console.error(`Error creating path visualization for bridge ${index}:`, error);
      }
    });
  }

  /**
   * Clear path visualization markers
   */
  public clearPathMarkers(): void {
    this.pathMarkers.forEach(marker => {
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
    this.pathMarkers = [];
  }

  public getBridgePointMarkers(): THREE.Object3D[] {
    return this.bridgePointMarkers;
  }

  public getDockPointMarkers(): THREE.Object3D[] {
    return this.dockPointMarkers;
  }

  public getPathMarkers(): THREE.Object3D[] {
    return this.pathMarkers;
  }

  /**
   * Find the nearest bridge point to a given screen position
   * This helps with bridge selection when precise clicking is difficult
   */
  public findNearestBridgePoint(clientX: number, clientY: number, camera: THREE.Camera): string | null {
    // Convert screen position to normalized device coordinates
    const rect = (camera as any).renderer?.domElement.getBoundingClientRect();
    if (!rect) return null;
    
    const x = ((clientX - rect.left) / rect.width) * 2 - 1;
    const y = -((clientY - rect.top) / rect.height) * 2 + 1;
    
    // Create a raycaster
    const raycaster = new THREE.Raycaster();
    raycaster.setFromCamera(new THREE.Vector2(x, y), camera);
    
    // Filter for bridge markers only
    const bridgeMarkers = this.bridgePointMarkers.filter(
      obj => obj instanceof THREE.Mesh && obj.userData && obj.userData.type === 'bridge'
    );
    
    // Find intersections
    const intersects = raycaster.intersectObjects(bridgeMarkers as THREE.Object3D[]);
    
    if (intersects.length > 0) {
      return intersects[0].object.userData.id;
    }
    
    // If no direct hit, find the closest bridge point within a reasonable distance
    const MAX_DISTANCE = 50; // Maximum pixel distance to consider
    let closestId = null;
    let closestDistance = MAX_DISTANCE;
    
    bridgeMarkers.forEach(marker => {
      if (marker instanceof THREE.Mesh) {
        // Project the 3D position to screen space
        const position = marker.position.clone();
        position.project(camera);
        
        // Convert to screen coordinates
        const screenX = (position.x + 1) * rect.width / 2 + rect.left;
        const screenY = (-position.y + 1) * rect.height / 2 + rect.top;
        
        // Calculate distance to click point
        const distance = Math.sqrt(
          Math.pow(screenX - clientX, 2) + 
          Math.pow(screenY - clientY, 2)
        );
        
        // Update closest if this is closer
        if (distance < closestDistance) {
          closestDistance = distance;
          closestId = marker.userData.id;
        }
      }
    });
    
    return closestId;
  }

  public cleanup(): void {
    this.clearTransportMarkers();
    this.clearPathMarkers();
  }
}
