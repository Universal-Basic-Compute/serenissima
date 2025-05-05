import { MutableRefObject } from 'react';
import * as THREE from 'three';
import { ViewMode } from '../../components/PolygonViewer/types';
import { eventBus, EventTypes } from '../eventBus';
import { InteractionFacade } from './InteractionFacade';
import { log } from '../logUtils';

interface InteractionManagerProps {
  camera: THREE.PerspectiveCamera;
  scene: THREE.Scene;
  polygonMeshesRef: MutableRefObject<Record<string, THREE.Mesh>>;
  activeView: ViewMode;
  throttleInterval?: number; // Optional throttle interval in ms
}

/**
 * Manages user interactions with 3D objects in the scene
 * Uses InteractionFacade to abstract Three.js complexity
 * Uses EventBus for communication with other components
 */
export class InteractionManager {
  private scene: THREE.Scene;
  private polygonMeshesRef: MutableRefObject<Record<string, THREE.Mesh>>;
  private activeView: ViewMode;
  private selectedPolygonId: string | null = null;
  private handleMouseClick: (event: MouseEvent) => void;
  private handleMouseDown: (event: MouseEvent) => void;
  private handleMouseMove: (event: MouseEvent) => void;
  private isProcessingClick: boolean = false;
  private isDragging: boolean = false;
  private mouseDownPosition = { x: 0, y: 0 };
  private hoveredPolygonId: string | null = null;
  private enabled: boolean = true;
  private errorCount: number = 0;
  private lastErrorTime: number = 0;
  private readonly MAX_ERRORS_BEFORE_THROTTLE: number = 5;
  private readonly ERROR_THROTTLE_TIME: number = 5000; // 5 seconds
  private readonly ERROR_RESET_TIME: number = 30000; // 30 seconds
  
  // Facade for Three.js interaction
  private interactionFacade: InteractionFacade;
  
  // Throttle settings for mouse move events
  private lastMoveTime = 0;
  private moveThrottleInterval: number; // ms between move processing
  private lastHoverCheckTime = 0;
  private hoverThrottleInterval: number; // ms between hover checks

  constructor({
    camera,
    scene,
    polygonMeshesRef,
    activeView,
    throttleInterval = 16 // Default to 16ms (roughly 60fps)
  }: InteractionManagerProps) {
    try {
    this.scene = scene;
    this.polygonMeshesRef = polygonMeshesRef;
    this.activeView = activeView;
    this.moveThrottleInterval = throttleInterval;
    this.hoverThrottleInterval = throttleInterval * 2; // Hover checks at half the frequency of move events
    
    // Create the interaction facade
    this.interactionFacade = new InteractionFacade(camera);
    
    // Subscribe to relevant events
    eventBus.subscribe(EventTypes.POLYGON_SELECTED, (data: { polygonId: string | null }) => {
      this.selectedPolygonId = data.polygonId;
    });
    
    // Bind methods to this instance
    this.handleMouseClick = this.onMouseClick.bind(this);
    this.handleMouseDown = this.onMouseDown.bind(this);
    this.handleMouseMove = this.onMouseMove.bind(this);
    
    // Add event listeners
    window.addEventListener('click', this.handleMouseClick);
    window.addEventListener('mousedown', this.handleMouseDown);
    window.addEventListener('mousemove', this.handleMouseMove);
    
    log.info('InteractionManager: Initialized successfully');
    } catch (error) {
      log.error('InteractionManager: Failed to initialize', error);
      // Continue with a partially initialized state rather than failing completely
      this.enabled = false;
    }
  }
  
  /**
   * Handles errors in interaction methods with progressive fallback
   * @param error The error that occurred
   * @param context Context information about where the error occurred
   * @returns True if the error was handled and operation can continue, false if it should abort
   */
  private handleError(error: any, context: string): boolean {
    const now = performance.now();
    
    // Log the error
    log.error(`InteractionManager error in ${context}:`, error);
    
    // Increment error count if within throttle window
    if (now - this.lastErrorTime < this.ERROR_RESET_TIME) {
      this.errorCount++;
    } else {
      // Reset error count if outside reset window
      this.errorCount = 1;
    }
    
    this.lastErrorTime = now;
    
    // If too many errors occur in a short time, temporarily disable interaction
    if (this.errorCount >= this.MAX_ERRORS_BEFORE_THROTTLE) {
      log.warn(`InteractionManager: Too many errors (${this.errorCount}), temporarily disabling for ${this.ERROR_THROTTLE_TIME}ms`);
      this.enabled = false;
      
      // Re-enable after throttle time
      setTimeout(() => {
        this.enabled = true;
        log.info('InteractionManager: Re-enabling after error throttle');
      }, this.ERROR_THROTTLE_TIME);
      
      return false;
    }
    
    return true;
  }
  
  private onMouseDown(event: MouseEvent) {
    // Skip if disabled
    if (!this.enabled) return;
    
    try {
      this.mouseDownPosition = { x: event.clientX, y: event.clientY };
      this.isDragging = false;
      
      // Emit mouse down event
      eventBus.emit(EventTypes.INTERACTION_MOUSE_DOWN, {
        x: event.clientX,
        y: event.clientY,
        button: event.button
      });
    } catch (error) {
      this.handleError(error, 'onMouseDown');
    }
  }
  
  private onMouseMove(event: MouseEvent) {
    // Skip if disabled
    if (!this.enabled) return;
    
    try {
      const now = performance.now();
      
      // Always update the mouse position in the facade for accurate raycasting
      // even if we throttle other operations
      try {
        this.interactionFacade.updateMousePosition(event.clientX, event.clientY);
      } catch (error) {
        // If updating mouse position fails, log but continue with other operations
        log.warn('InteractionManager: Failed to update mouse position', error);
      }
      
      // Throttle mouse move event processing for better performance
      if (now - this.lastMoveTime < this.moveThrottleInterval) {
        return;
      }
      this.lastMoveTime = now;
      
      // Emit mouse move event with coordinates
      try {
        eventBus.emit(EventTypes.INTERACTION_MOUSE_MOVE, {
          x: event.clientX,
          y: event.clientY,
          buttons: event.buttons
        });
      } catch (error) {
        // If event emission fails, log but continue with other operations
        log.warn('InteractionManager: Failed to emit mouse move event', error);
      }
      
      // If mouse is down and has moved more than a few pixels, consider it a drag
      if (event.buttons > 0) {
        try {
          const isDragging = this.interactionFacade.hasMovedSignificantly(
            event.clientX, 
            event.clientY, 
            this.mouseDownPosition.x, 
            this.mouseDownPosition.y, 
            3
          );
          
          if (isDragging) {
            this.isDragging = true;
            eventBus.emit(EventTypes.INTERACTION_DRAG, {
              x: event.clientX,
              y: event.clientY,
              startX: this.mouseDownPosition.x,
              startY: this.mouseDownPosition.y
            });
          }
        } catch (error) {
          log.warn('InteractionManager: Error in drag detection', error);
        }
        return; // Skip hover detection during dragging
      }
      
      // Throttle hover detection separately (less frequent than move events)
      // This is more expensive due to raycasting
      if (now - this.lastHoverCheckTime < this.hoverThrottleInterval) {
        return;
      }
      this.lastHoverCheckTime = now;
      
      // Find intersected polygon using the facade
      let hoveredId = null;
      try {
        hoveredId = this.interactionFacade.findIntersectedObjectId(this.polygonMeshesRef.current);
      } catch (error) {
        // If raycasting fails, log and abort hover detection
        if (!this.handleError(error, 'hover detection')) {
          return;
        }
      }
      
      try {
        if (hoveredId) {
          if (this.hoveredPolygonId !== hoveredId) {
            // Update hover state through event bus
            eventBus.emit(EventTypes.POLYGON_HOVER, { polygonId: hoveredId });
            this.hoveredPolygonId = hoveredId;
            
            // Set cursor to pointer to indicate interactivity
            document.body.style.cursor = 'pointer';
          }
        } else if (this.hoveredPolygonId) {
          // If we're not hovering over any polygon but we were before
          eventBus.emit(EventTypes.POLYGON_HOVER, { polygonId: null });
          this.hoveredPolygonId = null;
          
          // Reset cursor
          document.body.style.cursor = 'default';
        }
      } catch (error) {
        // If updating hover state fails, log but don't abort
        log.warn('InteractionManager: Failed to update hover state', error);
      }
    } catch (error) {
      // Catch-all for any other errors in mouse move handling
      this.handleError(error, 'onMouseMove');
    }
  }
  
  private onMouseClick(event: MouseEvent) {
    // Skip if disabled
    if (!this.enabled) return;
    
    try {
      // Skip if this click is for road creation
      if ((event as any).isRoadCreationClick) {
        log.info('InteractionManager: Skipping click handling for road creation');
        return;
      }
      
      // Prevent processing if already handling a click
      if (this.isProcessingClick) return;
      
      // Only handle left-click with no modifier keys
      if (event.button !== 0 || event.ctrlKey || event.shiftKey || event.altKey || event.metaKey) {
        return;
      }
      
      // CRITICAL: Check if this is a drag end event rather than a true click
      if (this.isDragging) {
        this.isDragging = false;
        try {
          eventBus.emit(EventTypes.INTERACTION_DRAG_END, {
            x: event.clientX,
            y: event.clientY
          });
        } catch (error) {
          log.warn('InteractionManager: Failed to emit drag end event', error);
        }
        return;
      }
      
      // Check if moved significantly from mousedown position
      let hasMoved = false;
      try {
        hasMoved = this.interactionFacade.hasMovedSignificantly(
          event.clientX, 
          event.clientY, 
          this.mouseDownPosition.x, 
          this.mouseDownPosition.y
        );
      } catch (error) {
        log.warn('InteractionManager: Error checking movement significance', error);
      }
      
      if (hasMoved) {
        return;
      }
      
      this.isProcessingClick = true;
      
      try {
        // Emit raw click event
        eventBus.emit(EventTypes.INTERACTION_CLICK, {
          x: event.clientX,
          y: event.clientY,
          button: event.button
        });
      } catch (error) {
        log.warn('InteractionManager: Failed to emit click event', error);
        // Continue processing even if event emission fails
      }
      
      try {
        // Update mouse position in the facade
        this.interactionFacade.updateMousePosition(event.clientX, event.clientY);
        
        // Find intersected polygon using the facade
        let clickedId = null;
        
        try {
          clickedId = this.interactionFacade.findIntersectedObjectId(this.polygonMeshesRef.current);
        } catch (error) {
          log.warn('InteractionManager: First-pass intersection detection failed', error);
          // Continue to second pass even if first pass fails
        }
        
        // If no polygon was found, try with increased precision
        if (!clickedId) {
          try {
            clickedId = this.interactionFacade.findIntersectedObjectIdWithIncreasedPrecision(
              this.polygonMeshesRef.current
            );
            
            if (clickedId) {
              log.info(`Second pass selection: ${clickedId}`);
            }
          } catch (error) {
            log.warn('InteractionManager: Second-pass intersection detection failed', error);
          }
        } else {
          log.info(`Selecting polygon: ${clickedId}`);
        }
        
        try {
          if (clickedId) {
            // Only toggle selection if clicking the same polygon
            // Otherwise, always select the new polygon
            const newSelectedId = clickedId === this.selectedPolygonId ? null : clickedId;
            
            // Update selection state through event bus only
            eventBus.emit(EventTypes.POLYGON_SELECTED, { polygonId: newSelectedId });
            this.selectedPolygonId = newSelectedId;
          } else if (this.selectedPolygonId) {
            // Clicking on empty space, deselect current selection
            eventBus.emit(EventTypes.POLYGON_SELECTED, { polygonId: null });
            this.selectedPolygonId = null;
          }
        } catch (error) {
          log.error('InteractionManager: Failed to update selection state', error);
        }
      } catch (error) {
        // If the main click handling fails, log and handle the error
        this.handleError(error, 'click handling');
      } finally {
        // Always reset processing state to prevent locking
        this.isProcessingClick = false;
      }
    } catch (error) {
      // Catch-all for any other errors in click handling
      log.error('InteractionManager: Unhandled error in click handler', error);
      this.isProcessingClick = false;
    }
  }
  
  /**
   * Update the active view mode
   * @param activeView The new view mode
   */
  public updateViewMode(activeView: ViewMode) {
    try {
      this.activeView = activeView;
      log.info(`InteractionManager: View mode updated to ${activeView}`);
    } catch (error) {
      log.error('InteractionManager: Failed to update view mode', error);
    }
  }
  
  /**
   * Update throttling intervals for performance tuning
   * @param moveInterval Milliseconds between processing move events
   * @param hoverInterval Milliseconds between processing hover detection (defaults to 2x moveInterval)
   */
  public updateThrottleIntervals(moveInterval: number, hoverInterval?: number) {
    try {
      this.moveThrottleInterval = moveInterval;
      this.hoverThrottleInterval = hoverInterval || moveInterval * 2;
      log.info(`InteractionManager: Throttle intervals updated - move: ${moveInterval}ms, hover: ${this.hoverThrottleInterval}ms`);
    } catch (error) {
      log.error('InteractionManager: Failed to update throttle intervals', error);
    }
  }
  
  /**
   * Enable or disable interaction
   * @param enabled Whether interaction is enabled
   */
  public setEnabled(enabled: boolean) {
    try {
      const wasEnabled = this.enabled;
      this.enabled = enabled;
      
      if (wasEnabled !== enabled) {
        log.info(`InteractionManager: Interaction ${enabled ? 'enabled' : 'disabled'}`);
      }
      
      // If re-enabling after errors, reset error count
      if (enabled && !wasEnabled) {
        this.errorCount = 0;
      }
    } catch (error) {
      log.error('InteractionManager: Failed to set enabled state', error);
    }
  }
  
  /**
   * Clean up resources and event listeners
   */
  public cleanup() {
    try {
      log.info('InteractionManager: Cleaning up resources');
      
      // Remove event listeners
      try {
        window.removeEventListener('click', this.handleMouseClick);
        window.removeEventListener('mousedown', this.handleMouseDown);
        window.removeEventListener('mousemove', this.handleMouseMove);
      } catch (error) {
        log.warn('InteractionManager: Error removing event listeners', error);
      }
      
      // Dispose the facade
      try {
        if (this.interactionFacade) {
          this.interactionFacade.dispose();
        }
      } catch (error) {
        log.warn('InteractionManager: Error disposing interaction facade', error);
      }
      
      // Clear references
      this.polygonMeshesRef = { current: {} } as MutableRefObject<Record<string, THREE.Mesh>>;
      this.hoveredPolygonId = null;
      this.selectedPolygonId = null;
      
      log.info('InteractionManager: Cleanup complete');
    } catch (error) {
      log.error('InteractionManager: Failed to clean up resources', error);
    }
  }
  
  /**
   * Attempt to recover from error state
   * @returns True if recovery was successful
   */
  public attemptRecovery(): boolean {
    try {
      log.info('InteractionManager: Attempting recovery from error state');
      
      // Reset error count
      this.errorCount = 0;
      
      // Re-enable interaction if it was disabled
      this.enabled = true;
      
      // Reset state
      this.isProcessingClick = false;
      this.isDragging = false;
      
      // Reset hover state if needed
      if (this.hoveredPolygonId) {
        try {
          eventBus.emit(EventTypes.POLYGON_HOVER, { polygonId: null });
          this.hoveredPolygonId = null;
          document.body.style.cursor = 'default';
        } catch (error) {
          log.warn('InteractionManager: Failed to reset hover state during recovery', error);
        }
      }
      
      log.info('InteractionManager: Recovery successful');
      return true;
    } catch (error) {
      log.error('InteractionManager: Recovery attempt failed', error);
      return false;
    }
  }
}
