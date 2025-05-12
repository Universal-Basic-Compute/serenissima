import * as THREE from 'three';

export interface MeasurementToolsProps {
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
}

export class MeasurementTools {
  private scene: THREE.Scene;
  private camera: THREE.PerspectiveCamera;
  private measurementPoints: THREE.Vector3[] = [];
  private measurementMarkers: THREE.Mesh[] = [];
  private measurementLine: THREE.Line | null = null;
  private measurementLabel: THREE.Sprite | null = null;
  private measurementCircle: THREE.Mesh | null = null;

  constructor({ scene, camera }: MeasurementToolsProps) {
    this.scene = scene;
    this.camera = camera;
  }

  public addMeasurementPoint(point: THREE.Vector3): void {
    // Create a marker at the clicked position
    const geometry = new THREE.CircleGeometry(0.3, 32);
    const material = new THREE.MeshBasicMaterial({
      color: 0xFFFF00,
      transparent: true,
      opacity: 0.8,
      side: THREE.DoubleSide
    });

    const marker = new THREE.Mesh(geometry, material);
    marker.position.set(point.x, point.y + 0.05, point.z);
    marker.rotation.x = -Math.PI / 2; // Make it flat
    marker.renderOrder = 100;

    this.scene.add(marker);
    this.measurementMarkers.push(marker);
    this.measurementPoints.push(point.clone());

    // If we have two points, create or update the line and distance label
    if (this.measurementPoints.length === 2) {
      this.updateMeasurementLine();
    }

    // If we have more than two points, remove the oldest point and marker
    if (this.measurementPoints.length > 2) {
      const oldestPoint = this.measurementPoints.shift();
      const oldestMarker = this.measurementMarkers.shift();
      if (oldestMarker) {
        this.scene.remove(oldestMarker);
        if (oldestMarker.geometry) oldestMarker.geometry.dispose();
        if (oldestMarker.material instanceof THREE.Material) {
          oldestMarker.material.dispose();
        } else if (Array.isArray(oldestMarker.material)) {
          oldestMarker.material.forEach(m => m.dispose());
        }
      }

      // Update the line with the new points
      this.updateMeasurementLine();
    }
  }

  private updateMeasurementLine(): void {
    // Remove existing line and label
    if (this.measurementLine) {
      this.scene.remove(this.measurementLine);
      if (this.measurementLine.geometry) this.measurementLine.geometry.dispose();
      if (this.measurementLine.material instanceof THREE.Material) {
        this.measurementLine.material.dispose();
      }
      this.measurementLine = null;
    }

    if (this.measurementLabel) {
      this.scene.remove(this.measurementLabel);
      if (this.measurementLabel.material instanceof THREE.SpriteMaterial) {
        if (this.measurementLabel.material.map) {
          this.measurementLabel.material.map.dispose();
        }
        this.measurementLabel.material.dispose();
      }
      this.measurementLabel = null;
    }

    // Create a new line between the two points
    if (this.measurementPoints.length >= 2) {
      const start = this.measurementPoints[0];
      const end = this.measurementPoints[1];

      // Create line geometry
      const lineGeometry = new THREE.BufferGeometry();
      const vertices = new Float32Array([
        start.x, start.y + 0.1, start.z,
        end.x, end.y + 0.1, end.z
      ]);
      lineGeometry.setAttribute('position', new THREE.BufferAttribute(vertices, 3));

      // Create line material
      const lineMaterial = new THREE.LineBasicMaterial({
        color: 0xFFFF00,
        linewidth: 2
      });

      // Create line
      this.measurementLine = new THREE.Line(lineGeometry, lineMaterial);
      this.measurementLine.renderOrder = 99;
      this.scene.add(this.measurementLine);

      // Calculate distance in meters
      const distance = this.calculateDistanceInMeters(start, end);

      // Create a text label to show the distance
      const canvas = document.createElement('canvas');
      const context = canvas.getContext('2d');
      if (context) {
        canvas.width = 256;
        canvas.height = 128;

        // Draw background
        context.fillStyle = 'rgba(0, 0, 0, 0.7)';
        context.fillRect(0, 0, canvas.width, canvas.height);

        // Draw border
        context.strokeStyle = '#FFFF00';
        context.lineWidth = 2;
        context.strokeRect(2, 2, canvas.width - 4, canvas.height - 4);

        // Draw text
        context.font = 'bold 24px Arial';
        context.fillStyle = '#FFFFFF';
        context.textAlign = 'center';
        context.textBaseline = 'middle';
        context.fillText(`${distance.toFixed(1)} meters`, canvas.width / 2, canvas.height / 2);

        // Create texture from canvas
        const texture = new THREE.CanvasTexture(canvas);

        // Create sprite material
        const spriteMaterial = new THREE.SpriteMaterial({
          map: texture,
          transparent: true
        });

        // Create sprite
        this.measurementLabel = new THREE.Sprite(spriteMaterial);

        // Position sprite at the midpoint of the line, slightly above
        const midpoint = new THREE.Vector3(
          (start.x + end.x) / 2,
          Math.max(start.y, end.y) + 0.5, // Position above the highest point
          (start.z + end.z) / 2
        );
        this.measurementLabel.position.copy(midpoint);

        // Scale sprite based on distance from camera
        const distance = this.camera.position.distanceTo(midpoint);
        const scale = Math.max(1, distance / 10); // Scale up as camera gets further away
        this.measurementLabel.scale.set(scale, scale * 0.5, 1); // Make height 1/2 of width

        this.measurementLabel.renderOrder = 101;
        this.scene.add(this.measurementLabel);
      }
    }
  }

  private calculateDistanceInMeters(point1: THREE.Vector3, point2: THREE.Vector3): number {
    // Simple Euclidean distance for now
    return point1.distanceTo(point2) * 10; // Scale factor to convert to meters
  }

  public clearMeasurements(): void {
    // Clean up measurement objects
    this.measurementMarkers.forEach(marker => {
      this.scene.remove(marker);
      if (marker.geometry) marker.geometry.dispose();
      if (marker.material instanceof THREE.Material) {
        marker.material.dispose();
      } else if (Array.isArray(marker.material)) {
        marker.material.forEach(m => m.dispose());
      }
    });
    this.measurementMarkers = [];

    if (this.measurementLine) {
      this.scene.remove(this.measurementLine);
      if (this.measurementLine.geometry) this.measurementLine.geometry.dispose();
      if (this.measurementLine.material instanceof THREE.Material) {
        this.measurementLine.material.dispose();
      }
      this.measurementLine = null;
    }

    if (this.measurementLabel) {
      this.scene.remove(this.measurementLabel);
      if (this.measurementLabel.material instanceof THREE.SpriteMaterial) {
        if (this.measurementLabel.material.map) {
          this.measurementLabel.material.map.dispose();
        }
        this.measurementLabel.material.dispose();
      }
      this.measurementLabel = null;
    }

    if (this.measurementCircle) {
      this.scene.remove(this.measurementCircle);
      if (this.measurementCircle.geometry) this.measurementCircle.geometry.dispose();
      if (this.measurementCircle.material instanceof THREE.Material) {
        this.measurementCircle.material.dispose();
      }
      this.measurementCircle = null;
    }

    this.measurementPoints = [];
  }

  public cleanup(): void {
    this.clearMeasurements();
  }
}