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
  private dragStartPosition: { x: number, y: number } | null = null;
  
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
   * Handle zoom operation
   * @param delta The zoom delta value
   * @returns The new scale value
   */
  public handleZoom(delta: number): number {
    const prevScale = this.scale;
    const newScale = Math.max(1.0, Math.min(10.8, prevScale + delta));
    
    // Only trigger a redraw if the scale changed significantly
    if (Math.abs(newScale - prevScale) > 0.05) {
      this.setScale(newScale);
      
      // Force a redraw with the new scale
      requestAnimationFrame(() => {
        window.dispatchEvent(new CustomEvent('scaleChanged', { 
          detail: { scale: newScale } 
        }));
      });
    }
    
    return newScale;
  }
  
  /**
   * Start panning operation
   * @param x The starting x coordinate
   * @param y The starting y coordinate
   */
  public startPan(x: number, y: number): void {
    this.dragStartPosition = { x, y };
  }
  
  /**
   * Update panning operation
   * @param x The current x coordinate
   * @param y The current y coordinate
   * @returns The new offset
   */
  public updatePan(x: number, y: number): { x: number, y: number } {
    if (!this.dragStartPosition) return this.offset;
    
    const dx = x - this.dragStartPosition.x;
    const dy = y - this.dragStartPosition.y;
    
    const newOffset = { 
      x: this.offset.x + dx, 
      y: this.offset.y + dy 
    };
    
    this.offset = newOffset;
    this.dragStartPosition = { x, y };
    
    // Emit event
    eventBus.emit(EventTypes.VIEWPORT_OFFSET_CHANGED, { offset: newOffset });
    
    return newOffset;
  }
  
  /**
   * End panning operation
   */
  public endPan(): void {
    this.dragStartPosition = null;
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
