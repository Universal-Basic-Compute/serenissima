/**
 * ViewportService
 * Handles viewport transformations and state management
 */

import { eventBus, EventTypes } from '../utils/eventBus';

// Add these to EventTypes
EventTypes.VIEWPORT_SCALE_CHANGED = 'VIEWPORT_SCALE_CHANGED';
EventTypes.VIEWPORT_OFFSET_CHANGED = 'VIEWPORT_OFFSET_CHANGED';
EventTypes.VIEWPORT_RESET = 'VIEWPORT_RESET';
EventTypes.VIEWPORT_STATE = 'VIEWPORT_STATE';

export class ViewportService {
  private scale: number = 3;
  private offset: { x: number, y: number } = { x: 0, y: 0 };
  
  /**
   * Set the viewport scale
   */
  public setScale(scale: number): void {
    this.scale = scale;
    
    // Emit event
    eventBus.emit(EventTypes.VIEWPORT_SCALE_CHANGED, { scale });
  }
  
  /**
   * Set the viewport offset
   */
  public setOffset(offset: { x: number, y: number }): void {
    this.offset = offset;
    
    // Emit event
    eventBus.emit(EventTypes.VIEWPORT_OFFSET_CHANGED, { offset });
  }
  
  /**
   * Get the current viewport scale
   */
  public getScale(): number {
    return this.scale;
  }
  
  /**
   * Get the current viewport offset
   */
  public getOffset(): { x: number, y: number } {
    return this.offset;
  }
  
  /**
   * Reset the viewport to default values
   */
  public resetViewport(): void {
    this.scale = 3;
    this.offset = { x: 0, y: 0 };
    
    // Emit event
    eventBus.emit(EventTypes.VIEWPORT_RESET, {
      scale: this.scale,
      offset: this.offset
    });
  }
  
  /**
   * Emit the current viewport state
   */
  public emitViewportState(): void {
    eventBus.emit(EventTypes.VIEWPORT_STATE, {
      scale: this.scale,
      offset: this.offset
    });
  }
}

// Export a singleton instance
export const viewportService = new ViewportService();
