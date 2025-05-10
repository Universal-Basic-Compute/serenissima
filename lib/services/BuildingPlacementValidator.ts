import * as THREE from 'three';
import { BuildingData, PlacementContext, PlacementResult } from '../models/BuildingTypes';

/**
 * Interface for building placement rules
 */
interface PlacementRule {
  validate(building: BuildingData, context: PlacementContext): PlacementResult;
}

/**
 * Rule to ensure building is placed on land owned by the player
 */
class OwnershipRule implements PlacementRule {
  validate(building: BuildingData, context: PlacementContext): PlacementResult {
    if (context.owner !== building.created_by && context.owner !== building.owner) {
      return {
        valid: false,
        reason: 'You can only place buildings on land you own'
      };
    }
    return { valid: true };
  }
}

/**
 * Rule to ensure building is placed at a minimum distance from other buildings
 */
class MinimumDistanceRule implements PlacementRule {
  constructor(private minDistance: number) {}
  
  validate(building: BuildingData, context: PlacementContext): PlacementResult {
    // Convert building position to THREE.Vector3 for distance calculation
    let buildingPosition: THREE.Vector3;
    
    if ('lat' in building.position && 'lng' in building.position) {
      // This is a simplified conversion - in a real implementation, use BuildingPositionManager
      const lat = building.position.lat;
      const lng = building.position.lng;
      
      // Define Venice center coordinates and scaling factors
      const bounds = {
        centerLat: 45.4371,
        centerLng: 12.3358,
        scale: 100000,
        latCorrectionFactor: 0.7
      };
      
      // Calculate x and z directly
      const x = (lng - bounds.centerLng) * bounds.scale;
      const z = -(lat - bounds.centerLat) * bounds.scale * bounds.latCorrectionFactor;
      
      buildingPosition = new THREE.Vector3(x, 0, z);
    } else {
      buildingPosition = new THREE.Vector3(
        building.position.x,
        building.position.y || 0,
        building.position.z
      );
    }
    
    // Check distance to all existing buildings
    for (const existingBuilding of context.existingBuildings) {
      // Skip the building itself
      if (existingBuilding.id === building.id) continue;
      
      let existingPosition: THREE.Vector3;
      
      if ('lat' in existingBuilding.position && 'lng' in existingBuilding.position) {
        // This is a simplified conversion - in a real implementation, use BuildingPositionManager
        const lat = existingBuilding.position.lat;
        const lng = existingBuilding.position.lng;
        
        // Define Venice center coordinates and scaling factors
        const bounds = {
          centerLat: 45.4371,
          centerLng: 12.3358,
          scale: 100000,
          latCorrectionFactor: 0.7
        };
        
        // Calculate x and z directly
        const x = (lng - bounds.centerLng) * bounds.scale;
        const z = -(lat - bounds.centerLat) * bounds.scale * bounds.latCorrectionFactor;
        
        existingPosition = new THREE.Vector3(x, 0, z);
      } else {
        existingPosition = new THREE.Vector3(
          existingBuilding.position.x,
          existingBuilding.position.y || 0,
          existingBuilding.position.z
        );
      }
      
      const distance = buildingPosition.distanceTo(existingPosition);
      
      if (distance < this.minDistance) {
        return {
          valid: false,
          reason: `Building is too close to another building (${distance.toFixed(1)} units, minimum ${this.minDistance} units)`
        };
      }
    }
    
    return { valid: true };
  }
}

/**
 * Rule to ensure dock buildings are placed at water edges
 */
class WaterEdgeRule implements PlacementRule {
  validate(building: BuildingData, context: PlacementContext): PlacementResult {
    // Only apply to dock buildings
    if (building.type !== 'dock') {
      return { valid: true };
    }
    
    // In a real implementation, this would check if the position is at a water edge
    // For this example, we'll use a simplified check
    
    // Get the position in scene coordinates
    let position: THREE.Vector3;
    
    if ('lat' in building.position && 'lng' in building.position) {
      // This is a simplified conversion - in a real implementation, use BuildingPositionManager
      const lat = building.position.lat;
      const lng = building.position.lng;
      
      // Define Venice center coordinates and scaling factors
      const bounds = {
        centerLat: 45.4371,
        centerLng: 12.3358,
        scale: 100000,
        latCorrectionFactor: 0.7
      };
      
      // Calculate x and z directly
      const x = (lng - bounds.centerLng) * bounds.scale;
      const z = -(lat - bounds.centerLat) * bounds.scale * bounds.latCorrectionFactor;
      
      position = new THREE.Vector3(x, 0, z);
    } else {
      position = new THREE.Vector3(
        building.position.x,
        building.position.y || 0,
        building.position.z
      );
    }
    
    // Check if the position is at a water edge
    // This would normally involve raycasting or checking against water edge data
    // For this example, we'll assume it's valid
    
    return { valid: true };
  }
}

/**
 * Rule to ensure buildings are placed on suitable terrain
 */
class TerrainSlopeRule implements PlacementRule {
  validate(building: BuildingData, context: PlacementContext): PlacementResult {
    // In a real implementation, this would check the terrain slope at the building position
    // For this example, we'll assume it's valid
    
    return { valid: true };
  }
}

/**
 * Rule to ensure buildings are placed near the center of land parcels
 */
class LandCenterRule implements PlacementRule {
  validate(building: BuildingData, context: PlacementContext): PlacementResult {
    // In a real implementation, this would check if the position is near the center of the land parcel
    // For this example, we'll assume it's valid
    
    return { valid: true };
  }
}

/**
 * Validator for building placement
 * Uses a collection of rules to validate building placement
 */
export class BuildingPlacementValidator {
  private rules: Map<string, PlacementRule[]> = new Map();
  
  constructor() {
    // Register rules for different building types
    this.rules.set('dock', [
      new WaterEdgeRule(),
      new MinimumDistanceRule(10),
      new OwnershipRule()
    ]);
    
    this.rules.set('market-stall', [
      new LandCenterRule(),
      new MinimumDistanceRule(5),
      new OwnershipRule()
    ]);
    
    // Default rules for all building types
    this.rules.set('default', [
      new OwnershipRule(),
      new TerrainSlopeRule(),
      new MinimumDistanceRule(3)
    ]);
  }
  
  /**
   * Validate building placement
   * @param building Building data to validate
   * @param context Context for validation
   * @returns Validation result
   */
  public validate(building: BuildingData, context: PlacementContext): PlacementResult {
    // Get rules for this building type
    const typeRules = this.rules.get(building.type) || [];
    const defaultRules = this.rules.get('default') || [];
    const allRules = [...typeRules, ...defaultRules];
    
    // Apply all rules
    for (const rule of allRules) {
      const result = rule.validate(building, context);
      if (!result.valid) {
        return result;
      }
    }
    
    return { valid: true };
  }
  
  /**
   * Add a custom rule for a building type
   * @param buildingType Building type
   * @param rule Rule to add
   */
  public addRule(buildingType: string, rule: PlacementRule): void {
    if (!this.rules.has(buildingType)) {
      this.rules.set(buildingType, []);
    }
    
    this.rules.get(buildingType).push(rule);
  }
}

// Create a singleton instance
const buildingPlacementValidator = new BuildingPlacementValidator();
export default buildingPlacementValidator;
