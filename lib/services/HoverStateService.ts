import { eventBus, EventTypes } from '../utils/eventBus';
import { debounce, throttle } from '../utils/performanceUtils';

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
  hoveredBuildingPoint: any | null;
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
    hoveredWaterPointId: null,
    hoveredBuildingPoint: null
  };
  
  // Add a debounced version of clearAllHoverStates
  private debouncedClearHoverStates = debounce(() => {
    // Only clear if something is actually hovered
    if (this.hoveredPolygonIdRef !== null || 
        this.hoveredBuildingIdRef !== null || 
        this.hoveredCanalPointIdRef !== null || 
        this.hoveredBridgePointIdRef !== null || 
        this.hoveredCitizenBuildingRef !== null || 
        this.hoveredCitizenTypeRef !== null || 
        this.hoveredResourceIdRef !== null || 
        this.hoveredWaterPointIdRef !== null || 
        this.hoveredBuildingPointRef !== null) {
      
      this.hoveredPolygonIdRef = null;
      this.hoveredBuildingIdRef = null;
      this.hoveredCanalPointIdRef = null;
      this.hoveredBridgePointIdRef = null;
      this.hoveredCitizenBuildingRef = null;
      this.hoveredCitizenTypeRef = null;
      this.hoveredResourceIdRef = null;
      this.hoveredResourceDataRef = null;
      this.hoveredWaterPointIdRef = null;
      this.hoveredBuildingPointRef = null;
      
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
        hoveredWaterPointId: null,
        hoveredBuildingPoint: null
      };
      
      // Emit event
      eventBus.emit(HOVER_STATE_CHANGED, {
        type: 'clear'
      });
    }
  }, 150); // Increased to 150ms debounce for better stability
  
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
  private hoveredBuildingPointRef: string | null = null;
  
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
  public setHoveredCitizen(citizen: any, buildingId: string | null, type: 'home' | 'work' | null): void {
    console.log('HOVER_SERVICE: setHoveredCitizen called with:', {
      citizen: citizen ? {
        username: citizen.username || citizen.citizenid || citizen.CitizenId || citizen.id,
        name: `${citizen.firstname || citizen.FirstName || ''} ${citizen.lastname || citizen.LastName || ''}`,
        socialClass: citizen.socialclass || citizen.SocialClass || citizen.socialClass || '',
        imageUrl: citizen.imageurl || citizen.profileimage || citizen.ImageUrl || citizen.image
      } : null,
      buildingId,
      type
    });

    // Only update if the state has changed
    if (this.hoveredCitizenBuildingRef !== buildingId || this.hoveredCitizenTypeRef !== type) {
      this.hoveredCitizenBuildingRef = buildingId;
      this.hoveredCitizenTypeRef = type;
      this.state.hoveredCitizenBuilding = buildingId;
      this.state.hoveredCitizenType = type;
      
      // Emit event with only the changed property and include the citizen data
      console.log('HOVER_SERVICE: Emitting hover state changed event for citizen');
      eventBus.emit(HOVER_STATE_CHANGED, {
        type: 'citizen',
        citizen: citizen, // Include the full citizen object
        buildingId,
        citizenType: type
      });
    }
  }
  
  /**
   * Update hover state for a resource
   */
  public setHoveredResource = throttle((resourceId: string | null, resourceData: any | null): void => {
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
  }, 100); // 100ms throttle
  
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
   * Update hover state for a building point
   */
  public setHoveredBuildingPoint(pointId: string | null, point: any | null): void {
    // Only update if the state has changed
    if (this.hoveredBuildingPointRef !== pointId) {
      this.hoveredBuildingPointRef = pointId;
      this.state.hoveredBuildingPoint = point;
      
      // Emit event with only the changed property
      eventBus.emit(HOVER_STATE_CHANGED, {
        type: 'buildingPoint',
        id: pointId,
        point: point
      });
    }
  }
  
  /**
   * Clear all hover states
   */
  public clearAllHoverStates(): void {
    // Use the debounced version instead of immediate clearing
    this.debouncedClearHoverStates();
  }
}

// Export a singleton instance
export const hoverStateService = new HoverStateService();
