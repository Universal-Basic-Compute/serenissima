import * as THREE from 'three';
import { normalizeCoordinates, createPolygonShape } from '../../components/PolygonViewer/utils';
import { getIncomeDataService } from '../services/IncomeDataService';
import { getIncomeBasedColor } from '../colorUtils';

interface IncomePolygonRendererProps {
  scene: THREE.Scene;
  polygons: any[];
  bounds: {
    centerLat: number;
    centerLng: number;
    scale: number;
    latCorrectionFactor: number;
  };
}

export class IncomePolygonRenderer {
  private scene: THREE.Scene;
  private polygons: any[];
  private bounds: any;
  private incomeMeshes: (THREE.Mesh | THREE.LineSegments)[] = [];
  private isVisible: boolean = true;
  private isDisposed: boolean = false;
  
  constructor({ scene, polygons, bounds }: IncomePolygonRendererProps) {
    this.scene = scene;
    this.polygons = polygons;
    this.bounds = bounds;
    
    // Render income polygons
    this.renderIncomePolygons();
  }
  
  private renderIncomePolygons() {
    // Get income data service
    const incomeService = getIncomeDataService();
    const minIncome = incomeService.getMinIncome();
    const maxIncome = incomeService.getMaxIncome();
    
    console.log(`IncomePolygonRenderer: minIncome=${minIncome}, maxIncome=${maxIncome}`);
    console.log(`Total polygons to process: ${this.polygons.length}`);
    
    let processedCount = 0;
    let skippedCount = 0;
    let incomeDataCount = 0;
    
    // Process each polygon
    this.polygons.forEach(polygon => {
      try {
        if (!polygon.coordinates || polygon.coordinates.length < 3) {
          skippedCount++;
          return;
        }
        
        // Get income for this polygon
        const income = polygon.lastIncome !== undefined 
          ? polygon.lastIncome 
          : incomeService.getIncome(polygon.id);
        
        // Skip if no income data
        if (income === undefined) {
          skippedCount++;
          return;
        }
        
        incomeDataCount++;
        console.log(`Polygon ${polygon.id}: income=${income}`);
        
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
        
        // Create material with income-based color
        const color = getIncomeBasedColor(income, { minIncome, maxIncome });
        const material = new THREE.MeshBasicMaterial({
          color: color,
          transparent: true,
          opacity: 0.6,
          side: THREE.DoubleSide,
          depthWrite: false
        });
      
        // Create mesh
        const mesh = new THREE.Mesh(geometry, material);
      
        // Position mesh slightly above land
        mesh.rotation.x = -Math.PI / 2;
        mesh.position.y = 0.01; // Position just above land
        mesh.renderOrder = 2; // Higher than land (which is 1)
      
        // Add userData to identify this as an income polygon
        mesh.userData = {
          isIncomePolygon: true,
          polygonId: polygon.id,
          income: income
        };
      
        // Add to scene
        this.scene.add(mesh);
      
        // Store reference
        this.incomeMeshes.push(mesh);
      
        // Create a wireframe edge overlay with the same geometry but different material
        const edgeMaterial = new THREE.LineBasicMaterial({
          color: 0xffffff,  // White edges
          transparent: true,
          opacity: 0.9,     // Increased opacity for better visibility (from 0.8 to 0.9)
          linewidth: 8      // Thicker lines for better visibility (increased from 5 to 8)
        });
      
        // Create wireframe for edges
        const edges = new THREE.EdgesGeometry(geometry, 8); // Reduced threshold to show even more edges (from 10 to 8)
        const line = new THREE.LineSegments(edges, edgeMaterial);
      
        // Position the wireframe exactly like the main mesh but slightly higher
        // to ensure it appears on top of the polygon rather than inside
        line.rotation.x = -Math.PI / 2;
        line.position.y = 0.011; // Position higher than the colored mesh (0.01) to be on top
        line.renderOrder = 3;  // Just above the income polygons (2)
        
        // Ensure the edge material has proper depth settings
        edgeMaterial.depthWrite = false; // Don't write to depth buffer
        edgeMaterial.depthTest = true;   // Enable depth testing to respect z-order
      
        // Add to scene
        this.scene.add(line);
      
        // Store reference to the edge mesh as well
        this.incomeMeshes.push(line);
      } catch (error) {
        console.error(`Error rendering income polygon ${polygon.id}:`, error);
      }
    });
    
    console.log(`Rendered ${this.incomeMeshes.length} income polygons (processed: ${processedCount}, skipped: ${skippedCount}, with income data: ${incomeDataCount})`);
    
    // Log a sample of the income data for debugging
    const incomeData = incomeService.getAllIncomeData();
    console.log(`Total income data entries: ${incomeData.size}`);
    if (incomeData.size > 0) {
      console.log('Sample income data:');
      let count = 0;
      incomeData.forEach((value, key) => {
        if (count < 5) { // Log just the first 5 entries
          console.log(`  ${key}: ${value}`);
          count++;
        }
      });
    }
  }
  
  /**
   * Update income visualization when income data changes
   */
  public updateIncomeVisualization() {
    // Remove existing income meshes
    this.incomeMeshes.forEach(mesh => {
      this.scene.remove(mesh);
      if (mesh.geometry) mesh.geometry.dispose();
      if (mesh.material) {
        if (Array.isArray(mesh.material)) {
          mesh.material.forEach(m => m.dispose());
        } else {
          mesh.material.dispose();
        }
      }
    });
    
    this.incomeMeshes = [];
    
    // Re-render income polygons
    this.renderIncomePolygons();
  }
  
  /**
   * Set visibility of income visualization
   */
  public setVisible(visible: boolean) {
    if (this.isVisible === visible) return;
    
    this.isVisible = visible;
    this.incomeMeshes.forEach(mesh => {
      mesh.visible = visible;
    });
  }
  
  /**
   * Clean up resources
   */
  public cleanup() {
    if (this.isDisposed) return;
    
    // Remove meshes from scene and dispose resources
    this.incomeMeshes.forEach(mesh => {
      this.scene.remove(mesh);
      if (mesh.geometry) mesh.geometry.dispose();
      if (mesh.material) {
        if (Array.isArray(mesh.material)) {
          mesh.material.forEach(m => m.dispose());
        } else {
          mesh.material.dispose();
        }
      }
    });
    
    // Clear array
    this.incomeMeshes = [];
    
    this.isDisposed = true;
  }
}
