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
  // Add any other hover states you need
}

export class HoverStateService {
  private state: HoverState = {
    hoveredPolygonId: null,
    hoveredBuildingId: null,
    hoveredCanalPointId: null,
    hoveredBridgePointId: null,
    hoveredCitizenBuilding: null,
    hoveredCitizenType: null
  };
  
  // Use refs to track current state without causing re-renders
  private hoveredPolygonIdRef: string | null = null;
  private hoveredBuildingIdRef: string | null = null;
  private hoveredCanalPointIdRef: string | null = null;
  private hoveredBridgePointIdRef: string | null = null;
  private hoveredCitizenBuildingRef: string | null = null;
  private hoveredCitizenTypeRef: 'home' | 'work' | null = null;
  
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
   * Clear all hover states
   */
  public clearAllHoverStates(): void {
    const hadHoverStates = 
      this.hoveredPolygonIdRef !== null || 
      this.hoveredBuildingIdRef !== null || 
      this.hoveredCanalPointIdRef !== null || 
      this.hoveredBridgePointIdRef !== null || 
      this.hoveredCitizenBuildingRef !== null;
    
    // Reset all refs
    this.hoveredPolygonIdRef = null;
    this.hoveredBuildingIdRef = null;
    this.hoveredCanalPointIdRef = null;
    this.hoveredBridgePointIdRef = null;
    this.hoveredCitizenBuildingRef = null;
    this.hoveredCitizenTypeRef = null;
    
    // Reset state
    this.state = {
      hoveredPolygonId: null,
      hoveredBuildingId: null,
      hoveredCanalPointId: null,
      hoveredBridgePointId: null,
      hoveredCitizenBuilding: null,
      hoveredCitizenType: null
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
