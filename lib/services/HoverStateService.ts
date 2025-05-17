import { eventBus, EventTypes } from '../utils/eventBus';

// Define the hover state changed event type
const HOVER_STATE_CHANGED = 'HOVER_STATE_CHANGED';

export interface HoverState {
  hoveredPolygonId: string | null;
  hoveredBuildingId: string | null;
  hoveredCanalPointId: string | null;
  hoveredBridgePointId: string | null;
  hoveredCitizenBuilding: string | null;
  hoveredCitizenType: 'home' | 'work' | null;
  hoveredResourceId: string | null;
  hoveredResourceData: any | null;
  hoveredWaterPointId: string | null;
  // Add any other hover states you need
}

export class HoverStateService {
  private state: HoverState = {
    hoveredPolygonId: null,
    hoveredBuildingId: null,
    hoveredCanalPointId: null,
    hoveredBridgePointId: null,
    hoveredCitizenBuilding: null,
    hoveredCitizenType: null,
    hoveredResourceId: null,
    hoveredResourceData: null,
    hoveredWaterPointId: null
  };
  
  // Use refs to track current state without causing re-renders
  private hoveredPolygonIdRef: string | null = null;
  private hoveredBuildingIdRef: string | null = null;
  private hoveredCanalPointIdRef: string | null = null;
  private hoveredBridgePointIdRef: string | null = null;
  private hoveredCitizenBuildingRef: string | null = null;
  private hoveredCitizenTypeRef: 'home' | 'work' | null = null;
  private hoveredResourceIdRef: string | null = null;
  private hoveredResourceDataRef: any | null = null;
  private hoveredWaterPointIdRef: string | null = null;
  
  /**
   * Get the current hover state
   */
  public getState(): HoverState {
    return { ...this.state };
  }
  
  /**
   * Update hover state for a polygon
   */
  public setHoveredPolygon(polygonId: string | null): void {
    // Only update if the state has changed
    if (this.hoveredPolygonIdRef !== polygonId) {
      this.hoveredPolygonIdRef = polygonId;
      this.state.hoveredPolygonId = polygonId;
      
      // Emit event with only the changed property
      eventBus.emit(HOVER_STATE_CHANGED, {
        type: 'polygon',
        id: polygonId
      });
    }
  }
  
  /**
   * Update hover state for a building
   */
  public setHoveredBuilding(buildingId: string | null): void {
    // Only update if the state has changed
    if (this.hoveredBuildingIdRef !== buildingId) {
      this.hoveredBuildingIdRef = buildingId;
      this.state.hoveredBuildingId = buildingId;
      
      // Emit event with only the changed property
      eventBus.emit(HOVER_STATE_CHANGED, {
        type: 'building',
        id: buildingId
      });
    }
  }
  
  /**
   * Update hover state for a canal point
   */
  public setHoveredCanalPoint(pointId: string | null): void {
    // Only update if the state has changed
    if (this.hoveredCanalPointIdRef !== pointId) {
      this.hoveredCanalPointIdRef = pointId;
      this.state.hoveredCanalPointId = pointId;
      
      // Emit event with only the changed property
      eventBus.emit(HOVER_STATE_CHANGED, {
        type: 'canalPoint',
        id: pointId
      });
    }
  }
  
  /**
   * Update hover state for a bridge point
   */
  public setHoveredBridgePoint(pointId: string | null): void {
    // Only update if the state has changed
    if (this.hoveredBridgePointIdRef !== pointId) {
      this.hoveredBridgePointIdRef = pointId;
      this.state.hoveredBridgePointId = pointId;
      
      // Emit event with only the changed property
      eventBus.emit(HOVER_STATE_CHANGED, {
        type: 'bridgePoint',
        id: pointId
      });
    }
  }
  
  /**
   * Update hover state for a citizen
   */
  public setHoveredCitizen(buildingId: string | null, type: 'home' | 'work' | null): void {
    // Only update if the state has changed
    if (this.hoveredCitizenBuildingRef !== buildingId || this.hoveredCitizenTypeRef !== type) {
      this.hoveredCitizenBuildingRef = buildingId;
      this.hoveredCitizenTypeRef = type;
      this.state.hoveredCitizenBuilding = buildingId;
      this.state.hoveredCitizenType = type;
      
      // Emit event with only the changed property
      eventBus.emit(HOVER_STATE_CHANGED, {
        type: 'citizen',
        buildingId,
        citizenType: type
      });
    }
  }
  
  /**
   * Update hover state for a resource
   */
  public setHoveredResource(resourceId: string | null, resourceData: any | null): void {
    // Only update if the state has changed
    if (this.hoveredResourceIdRef !== resourceId) {
      this.hoveredResourceIdRef = resourceId;
      this.hoveredResourceDataRef = resourceData;
      this.state.hoveredResourceId = resourceId;
      this.state.hoveredResourceData = resourceData;
      
      // Emit event with only the changed property
      eventBus.emit(HOVER_STATE_CHANGED, {
        type: 'resource',
        id: resourceId,
        data: resourceData
      });
    }
  }
  
  /**
   * Clear resource hover state
   */
  public clearHoveredResource(): void {
    if (this.hoveredResourceIdRef !== null) {
      this.hoveredResourceIdRef = null;
      this.hoveredResourceDataRef = null;
      this.state.hoveredResourceId = null;
      this.state.hoveredResourceData = null;
      
      // Emit event with only the changed property
      eventBus.emit(HOVER_STATE_CHANGED, {
        type: 'resource',
        id: null,
        data: null
      });
    }
  }
  
  /**
   * Update hover state for a water point
   */
  public setHoveredWaterPoint(pointId: string | null): void {
    // Only update if the state has changed
    if (this.hoveredWaterPointIdRef !== pointId) {
      this.hoveredWaterPointIdRef = pointId;
      this.state.hoveredWaterPointId = pointId;
      
      // Emit event with only the changed property
      eventBus.emit(HOVER_STATE_CHANGED, {
        type: 'waterPoint',
        id: pointId
      });
    }
  }
  
  /**
   * Get the current hovered water point ID
   */
  public getHoveredWaterPointId(): string | null {
    return this.hoveredWaterPointIdRef;
  }
  
  /**
   * Clear all hover states
   */
  public clearAllHoverStates(): void {
    const hadHoverStates = 
      this.hoveredPolygonIdRef !== null || 
      this.hoveredBuildingIdRef !== null || 
      this.hoveredCanalPointIdRef !== null || 
      this.hoveredBridgePointIdRef !== null || 
      this.hoveredCitizenBuildingRef !== null ||
      this.hoveredResourceIdRef !== null ||
      this.hoveredWaterPointIdRef !== null;
    
    // Reset all refs
    this.hoveredPolygonIdRef = null;
    this.hoveredBuildingIdRef = null;
    this.hoveredCanalPointIdRef = null;
    this.hoveredBridgePointIdRef = null;
    this.hoveredCitizenBuildingRef = null;
    this.hoveredCitizenTypeRef = null;
    this.hoveredResourceIdRef = null;
    this.hoveredResourceDataRef = null;
    this.hoveredWaterPointIdRef = null;
    
    // Reset state
    this.state = {
      hoveredPolygonId: null,
      hoveredBuildingId: null,
      hoveredCanalPointId: null,
      hoveredBridgePointId: null,
      hoveredCitizenBuilding: null,
      hoveredCitizenType: null,
      hoveredResourceId: null,
      hoveredResourceData: null,
      hoveredWaterPointId: null
    };
    
    // Only emit if there was something to clear
    if (hadHoverStates) {
      eventBus.emit(HOVER_STATE_CHANGED, {
        type: 'clear'
      });
    }
  }
}

// Export a singleton instance
export const hoverStateService = new HoverStateService();
