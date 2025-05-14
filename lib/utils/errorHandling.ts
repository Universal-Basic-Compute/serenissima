import { log } from './logUtils';
import * as THREE from 'three';

/**
 * Error types for categorizing rendering errors
 */
export enum RenderingErrorType {
  GEOMETRY_CREATION = 'geometry_creation',
  MATERIAL_CREATION = 'material_creation',
  TEXTURE_LOADING = 'texture_loading',
  MESH_CREATION = 'mesh_creation',
  SCENE_MANIPULATION = 'scene_manipulation',
  RESOURCE_DISPOSAL = 'resource_disposal',
  UNKNOWN = 'unknown'
}

/**
 * Interface for rendering errors with additional context
 */
export interface RenderingError {
  type: RenderingErrorType;
  message: string;
  entityId?: string;
  originalError?: Error;
  recoverable: boolean;
}

/**
 * Error handler for rendering operations
 */
export class RenderingErrorHandler {
  private static instance: RenderingErrorHandler;
  private errorCounts: Map<string, number> = new Map();
  private readonly MAX_ERRORS_PER_TYPE = 5;
  private readonly ERROR_RESET_INTERVAL = 60000; // 1 minute
  private fallbackMode: boolean = false;
  
  private constructor() {
    // Reset error counts periodically
    setInterval(() => this.resetErrorCounts(), this.ERROR_RESET_INTERVAL);
  }
  
  /**
   * Get singleton instance
   */
  public static getInstance(): RenderingErrorHandler {
    if (!RenderingErrorHandler.instance) {
      RenderingErrorHandler.instance = new RenderingErrorHandler();
    }
    return RenderingErrorHandler.instance;
  }
  
  /**
   * Handle a rendering error with appropriate logging and recovery
   */
  public handleError(error: RenderingError): boolean {
    // Increment error count for this type
    const currentCount = this.errorCounts.get(error.type) || 0;
    this.errorCounts.set(error.type, currentCount + 1);
    
    // Log the error with context
    const errorContext = error.entityId ? ` for ${error.entityId}` : '';
    log.error(`Rendering error${errorContext}: ${error.message}`, error.originalError);
    
    // Check if we should enter fallback mode
    if (currentCount >= this.MAX_ERRORS_PER_TYPE) {
      if (!this.fallbackMode) {
        log.warn(`Too many ${error.type} errors, entering fallback mode`);
        this.fallbackMode = true;
      }
    }
    
    // Return whether the error is recoverable
    return error.recoverable;
  }
  
  /**
   * Reset error counts periodically
   */
  private resetErrorCounts(): void {
    this.errorCounts.clear();
    
    // Exit fallback mode if we were in it
    if (this.fallbackMode) {
      log.info('Exiting fallback mode after error count reset');
      this.fallbackMode = false;
    }
  }
  
  /**
   * Check if we're in fallback mode
   */
  public isInFallbackMode(): boolean {
    return this.fallbackMode;
  }
  
  /**
   * Create a fallback material for when material creation fails
   */
  public createFallbackMaterial(color: string = '#FF00FF'): THREE.Material {
    return new THREE.MeshBasicMaterial({
      color: color,
      wireframe: true,
      transparent: true,
      opacity: 0.7,
      side: THREE.DoubleSide
    });
  }
  
  /**
   * Create a fallback geometry when geometry creation fails
   */
  public createFallbackGeometry(): THREE.BufferGeometry {
    return new THREE.PlaneGeometry(1, 1);
  }
}

/**
 * Wrap a function with error handling
 * @param fn Function to wrap
 * @param errorType Type of error for categorization
 * @param entityId Optional ID of the entity being processed
 * @param fallbackFn Optional fallback function to call on error
 */
export function withErrorHandling<T>(
  fn: () => T,
  errorType: RenderingErrorType,
  entityId?: string,
  fallbackFn?: () => T
): T | undefined {
  try {
    return fn();
  } catch (error) {
    const handler = RenderingErrorHandler.getInstance();
    const isRecoverable = handler.handleError({
      type: errorType,
      message: error instanceof Error ? error.message : String(error),
      entityId,
      originalError: error instanceof Error ? error : undefined,
      recoverable: !!fallbackFn
    });
    
    if (isRecoverable && fallbackFn) {
      try {
        return fallbackFn();
      } catch (fallbackError) {
        log.error(`Fallback also failed for ${errorType}${entityId ? ` (${entityId})` : ''}:`, 
          fallbackError instanceof Error ? fallbackError : String(fallbackError));
      }
    }
    
    return undefined;
  }
}
