import { eventBus } from '../utils/eventBus';
import { throttle } from '../utils/performanceUtils';
import { CitizenRenderService } from './CitizenRenderService'; // Import CitizenRenderService
// CitizenRenderService is not directly used in this file after setHoveredCitizen was updated.
// If it's used by other parts of hoverStateService that are not shown, keep it.
// For now, assuming it's only for the setHoveredCitizen method which now calls CitizenRenderService internally.

// Define the hover state changed event type
export const HOVER_STATE_CHANGED = 'HOVER_STATE_CHANGED';

// Define a comprehensive hover target type
export type HoverTargetType = 
  | 'none'
  | 'polygon'
  | 'building'
  | 'buildingPoint'
  | 'canalPoint'
  | 'bridgePoint'
  | 'citizen'
  | 'resource'
  | 'waterPoint'
  | 'contract'
  | 'problem';

// Define a comprehensive hover state interface
export interface HoverState {
  type: HoverTargetType;
  id: string | null;
  data: any | null;
  position?: { x: number, y: number } | null;
  timestamp: number;
}

export class HoverStateService {
  private currentState: HoverState = {
    type: 'none',
    id: null,
    data: null,
    position: null,
    timestamp: 0
  };
  
  private isHovering: boolean = false;
  private lastEmitTime: number = 0;
  private emitThrottleTime: number = 100; // ms
  private throttledHandleMouseMoveDocument: (event: MouseEvent) => void;
  
  // Throttled emit function to prevent too many events
  private throttledEmit = throttle((state: HoverState) => {
    eventBus.emit(HOVER_STATE_CHANGED, state);
    this.lastEmitTime = Date.now();
  }, this.emitThrottleTime);

  constructor() {
    if (typeof window !== 'undefined' && typeof document !== 'undefined') {
      // Bind methods to ensure 'this' context is correct
      this.handleMouseLeaveDocument = this.handleMouseLeaveDocument.bind(this);
      this.handleMouseMoveDocument = this.handleMouseMoveDocument.bind(this);

      // Throttle mousemove for performance
      this.throttledHandleMouseMoveDocument = throttle(this.handleMouseMoveDocument, 100); // 100ms throttle

      document.documentElement.addEventListener('mouseleave', this.handleMouseLeaveDocument);
      document.documentElement.addEventListener('mousemove', this.throttledHandleMouseMoveDocument);
    }
  }

  private handleMouseLeaveDocument(): void {
    this.clearHoverState();
  }

  private handleMouseMoveDocument(event: MouseEvent): void {
    let target = event.target as HTMLElement | null;
    let isOverUIPanel = false;
    while (target) {
      if (target.dataset && target.dataset.uiPanel === 'true') {
        isOverUIPanel = true;
        break;
      }
      // Check for common panel wrapper classes as a fallback, can be expanded
      if (target.classList && (
          target.classList.contains('modal-wrapper') || // Example class
          target.classList.contains('sidebar-panel')    // Example class
      )) {
        isOverUIPanel = true;
        break;
      }
      target = target.parentElement;
    }

    if (isOverUIPanel) {
      this.clearHoverState();
    }
  }
  
  /**
   * Set hover state with throttling to prevent rapid changes
   */
  public setHoverState(type: HoverTargetType, id: string | null, data: any = null, position: { x: number, y: number } | null = null): void {
    // Only update if something meaningful has changed
    if (
      this.currentState.type !== type || 
      this.currentState.id !== id ||
      // Use a more conservative approach for data comparison
      (data !== null && this.currentState.data === null) ||
      (data !== null && this.currentState.data !== null && 
       JSON.stringify(this.currentState.data) !== JSON.stringify(data))
    ) {
      this.currentState = {
        type,
        id,
        data,
        position,
        timestamp: Date.now()
      };
      
      this.isHovering = type !== 'none';
      
      // Only emit if enough time has passed since last emit
      const now = Date.now();
      if (now - this.lastEmitTime > this.emitThrottleTime) {
        eventBus.emit(HOVER_STATE_CHANGED, this.currentState);
        this.lastEmitTime = now;
      } else {
        // Use the throttled emit for frequent updates
        this.throttledEmit(this.currentState);
      }
    }
  }
  
  /**
   * Clear hover state
   */
  public clearHoverState(): void {
    // Only clear if we're actually hovering
    if (this.isHovering) {
      this.currentState = {
        type: 'none',
        id: null,
        data: null,
        position: null,
        timestamp: Date.now()
      };
      
      this.isHovering = false;
      this.throttledEmit(this.currentState);
    }
  }
  
  /**
   * Get current hover state
   */
  public getState(): HoverState {
    return { ...this.currentState };
  }
  
  /**
   * Check if currently hovering
   */
  public isCurrentlyHovering(): boolean {
    return this.isHovering;
  }
  
  /**
   * Get hover type
   */
  public getHoverType(): HoverTargetType {
    return this.currentState.type;
  }
  
  /**
   * Get hover ID
   */
  public getHoverId(): string | null {
    return this.currentState.id;
  }
  
  // Backward compatibility methods
  
  /**
   * Update hover state for a polygon
   */
  public setHoveredPolygon(polygonId: string | null, data: any = null): void {
    this.setHoverState('polygon', polygonId, data);
  }
  
  /**
   * Update hover state for a building
   * Accepts either a building ID string or a building data object.
   * If an object is passed, it will try to use `buildingData.buildingId` (custom ID) first,
   * then `buildingData.id` as the ID for the hover state.
   */
  public setHoveredBuilding(buildingIdOrObject: string | any | null, dataIfId?: any): void {
    if (!buildingIdOrObject) {
      this.setHoverState('building', null, null);
      return;
    }

    let idToUse: string | null = null;
    let buildingData: any | null = null;

    if (typeof buildingIdOrObject === 'string') {
      // If a string is passed, it's assumed to be the ID
      idToUse = buildingIdOrObject;
      buildingData = dataIfId || null; // Use the second arg as data if provided
    } else if (typeof buildingIdOrObject === 'object' && buildingIdOrObject !== null) {
      // If an object is passed, it's the building data
      buildingData = buildingIdOrObject;
      // Prioritize 'buildingId' (custom ID), then 'id' (potentially Airtable record ID or custom ID)
      idToUse = buildingData.buildingId || buildingData.id || null;
    }
    
    this.setHoverState('building', idToUse, buildingData);
  }
  
  /**
   * Update hover state for a canal point
   */
  public setHoveredCanalPoint(pointId: string | null, data: any = null): void {
    this.setHoverState('canalPoint', pointId, data);
  }
  
  /**
   * Update hover state for a bridge point
   */
  public setHoveredBridgePoint(pointId: string | null, data: any = null): void {
    this.setHoverState('bridgePoint', pointId, data);
  }
  
  /**
   * Update hover state for a citizen
   */
  public setHoveredCitizen(citizen: any, buildingId: string | null = null, type: 'home' | 'work' | null = null): void {
    // Use the CitizenRenderService to sanitize the citizen object
    const baseSafeCitizen = citizen ? CitizenRenderService.sanitizeCitizen(citizen) : null;
    
    // Preserve activityNotes from the original citizen object (which is citizenWithNotes)
    const activityNotes = citizen?.activityNotes || null;
    
    // Combine the sanitized citizen data with the activityNotes
    const finalCitizenData = baseSafeCitizen ? { ...baseSafeCitizen, activityNotes } : null;
    
    this.setHoverState('citizen', buildingId || baseSafeCitizen?.id || null, { 
      citizen: finalCitizenData, 
      buildingId, 
      citizenType: type 
    });
  }
  
  /**
   * Update hover state for a resource
   */
  public setHoveredResource(resourceId: string | null, resourceData: any = null): void {
    this.setHoverState('resource', resourceId, resourceData);
  }
  
  /**
   * Update hover state for a water point
   */
  public setHoveredWaterPoint(pointId: string | null, data: any = null): void {
    this.setHoverState('waterPoint', pointId, data);
  }
  
  /**
   * Update hover state for a building point
   */
  public setHoveredBuildingPoint(pointId: string | null, point: any = null): void {
    this.setHoverState('buildingPoint', pointId, point);
  }
  
  /**
   * Get the current hovered water point ID
   */
  public getHoveredWaterPointId(): string | null {
    return this.currentState.type === 'waterPoint' ? this.currentState.id : null;
  }
  
  /**
   * Clear resource hover state
   */
  public clearHoveredResource(): void {
    if (this.currentState.type === 'resource') {
      this.clearHoverState();
    }
  }
  
  /**
   * Update hover state for a problem
   */
  public setHoveredProblem(problemId: string | null, data: any = null): void {
    this.setHoverState('problem', problemId, data);
  }
  
  /**
   * Get the current hovered problem ID
   */
  public getHoveredProblemId(): string | null {
    return this.currentState.type === 'problem' ? this.currentState.id : null;
  }
  
  /**
   * Clear all hover states
   */
  public clearAllHoverStates(): void {
    this.clearHoverState();
  }
}

// Export a singleton instance
export const hoverStateService = new HoverStateService();
