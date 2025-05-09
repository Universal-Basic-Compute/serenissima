# 3D Rendering Architecture

La Serenissima uses Three.js for 3D rendering. The rendering architecture is designed to be modular, performant, and maintainable.

## Rendering Architecture Principles

1. **Abstraction**: Hide Three.js complexity behind clean interfaces
2. **Modularity**: Separate rendering concerns into focused components
3. **Performance**: Optimize rendering for different devices and scenarios
4. **Maintainability**: Use consistent patterns and documentation

## Rendering Layer Structure

The rendering architecture is organized into the following layers:

1. **Facade Layer**: Provides a simplified interface to Three.js
2. **Scene Management**: Manages the 3D scene, camera, and renderer
3. **Entity Management**: Manages 3D objects and their lifecycle
4. **Interaction Management**: Handles user interaction with 3D objects
5. **Effect Management**: Manages visual effects and post-processing

## Key Components

### ThreeJSFacade

The `ThreeJSFacade` class provides a simplified interface to Three.js:

```typescript
export class ThreeJSFacade {
  constructor(canvas: HTMLCanvasElement, options?: ThreeJSOptions);
  
  // Scene management
  public getScene(): THREE.Scene;
  public getCamera(): THREE.PerspectiveCamera;
  public getRenderer(): THREE.WebGLRenderer;
  public getControls(): OrbitControls;
  
  // Object management
  public addObject(object: THREE.Object3D, id?: string): void;
  public removeObject(objectOrId: THREE.Object3D | string): void;
  public getObject(id: string): THREE.Object3D | undefined;
  
  // Animation
  public addAnimationCallback(callback: (time: number) => void): void;
  public removeAnimationCallback(callback: (time: number) => void): void;
  
  // Rendering
  public forceRender(): void;
  
  // Cleanup
  public dispose(): void;
}
```

### SceneSetup

The `SceneSetup` class manages the 3D scene setup:

```typescript
export default class SceneSetup {
  constructor({ canvas, activeView, highQuality }: SceneSetupProps);
  
  // Scene components
  public scene: THREE.Scene;
  public camera: THREE.PerspectiveCamera;
  public renderer: THREE.WebGLRenderer;
  public controls: OrbitControls;
  public composer: EffectComposer;
  
  // Scene management
  public updateControlsState(isInteractingWithPolygon: boolean): void;
  public updateClouds(frameCount: number): void;
  public update(frameCount: number): void;
  public updateQuality(highQuality: boolean): void;
  
  // Cleanup
  public cleanup(): void;
}
```

### PolygonRenderer

The `PolygonRenderer` class manages the rendering of land polygons:

```typescript
export default class PolygonRenderer {
  constructor({
    scene,
    camera,
    polygons,
    bounds,
    activeView,
    performanceMode,
    polygonMeshesRef,
    users
  }: PolygonRendererProps);
  
  // Polygon management
  public update(selectedPolygonId: string | null): void;
  public updateViewMode(activeView: ViewMode): void;
  public updateQuality(performanceMode: boolean): void;
  
  // Owner management
  public updateOwnerCoatOfArms(ownerCoatOfArmsMap: Record<string, string>): void;
  public updateOwnerColors(colorMap: Record<string, string>): void;
  public updatePolygonOwnerColors(): void;
  public updatePolygonOwner(polygonId: string, newOwner: string): void;
  
  // Interaction
  public updateSelectionState(selectedPolygonId: string | null): void;
  public updateHoverState(hoveredPolygonId: string | null): void;
  
  // Visibility
  public ensurePolygonsVisible(): void;
  
  // Cleanup
  public cleanup(): void;
}
```

### InteractionFacade and InteractionManager

The interaction system uses a facade pattern to hide Three.js complexity:

```typescript
// InteractionFacade provides a simplified interface to Three.js raycasting
export class InteractionFacade {
  constructor(camera: THREE.PerspectiveCamera);
  
  // Mouse position and raycasting
  public updateMousePosition(clientX: number, clientY: number): void;
  public castRay(objects: THREE.Object3D[]): THREE.Intersection[];
  public findIntersectedObjectId(objectsMap: Record<string, THREE.Object3D>): string | null;
  public findIntersectedObjectIdWithIncreasedPrecision(objectsMap: Record<string, THREE.Object3D>): string | null;
  
  // Utility methods
  public hasMovedSignificantly(x: number, y: number, refX: number, refY: number, threshold?: number): boolean;
  
  // Cleanup
  public dispose(): void;
}

// InteractionManager uses the facade to handle user interactions
export class InteractionManager {
  constructor({
    camera,
    scene,
    polygonMeshesRef,
    activeView,
    throttleInterval,
    hoveredPolygonId,
    setHoveredPolygonId,
    selectedPolygonId,
    setSelectedPolygonId
  }: InteractionManagerProps);
  
  // Interaction management
  public updateViewMode(activeView: ViewMode): void;
  public setEnabled(enabled: boolean): void;
  public updateThrottleIntervals(moveInterval: number, hoverInterval?: number): void;
  
  // Cleanup
  public cleanup(): void;
}
```

## Rendering Pipeline

The rendering pipeline follows these steps:

1. **Scene Setup**: Initialize Three.js scene, camera, renderer, and controls
2. **Asset Loading**: Load textures, models, and other assets
3. **Object Creation**: Create 3D objects and add them to the scene
   - Base land layer (rendered once, never changes)
   - Visualization overlays (created dynamically based on view mode)
   - Owner indicators (positioned above all other elements)
4. **Rendering Loop**: Update and render the scene on each frame
5. **Interaction Handling**: Handle user interaction with 3D objects
6. **Cleanup**: Dispose of resources when components unmount

## Land Rendering Architecture

The system uses a layered approach to render land and its visualizations:

### Layer Separation

1. **Base Land Layer**:
   - Rendered once at initialization
   - Uses simple materials without complex textures
   - Never modified after initial creation
   - Provides the foundational geography

2. **Visualization Overlay Layer**:
   - Created dynamically based on active view mode
   - Positioned slightly above base land
   - Can be freely modified without affecting base geometry
   - Provides view-specific visual information

3. **Owner Indicator Layer**:
   - Positioned at the top layer
   - Simple colored circles at polygon centroids
   - Clearly visible above all other elements
   - Updated when ownership changes

This separation of concerns ensures optimal performance while maintaining visual clarity. The base land never needs to be re-rendered, significantly reducing GPU load during view transitions and updates.

## Benefits of Layered Land Rendering Approach

### Performance Improvements:
- Base land never needs to be re-rendered
- Texture loading only happens once at startup
- View switching becomes much faster
- Memory usage is reduced

### Simplified Architecture:
- Clear separation between base geometry and visualization
- No need for complex material swapping
- Easier to debug and maintain

### Enhanced Flexibility:
- New visualization modes can be added without affecting base rendering
- Animations and transitions between views become possible
- Can easily add/remove visual elements without touching base geometry

### Improved Stability:
- Less chance of rendering errors or flickering
- Reduced risk of memory leaks from texture/material disposal
- More predictable behavior across different devices

## Facade Pattern Implementation

The rendering system uses the facade pattern to hide Three.js complexity:

### WaterFacade

The `WaterFacade` provides a simplified interface to Three.js water rendering:

```typescript
export interface WaterFacadeProps {
  scene: THREE.Scene;
  size: number;
  quality?: 'high' | 'medium' | 'low';
  position?: { x?: number; y?: number; z?: number };
  color?: string | number;
  distortionScale?: number;
  flowDirection?: { x?: number; y?: number };
  flowSpeed?: number;
}

export class WaterFacade {
  constructor(options: WaterFacadeProps);
  
  // Update methods
  public update(deltaTime?: number): void;
  
  // Configuration methods
  public setQuality(quality: 'high' | 'medium' | 'low'): void;
  public setColor(color: string | number): void;
  public setPosition(position: { x?: number; y?: number; z?: number }): void;
  public setSize(size: number): void;
  public setFlow(direction: { x?: number; y?: number }, speed?: number): void;
  public setDistortion(scale: number): void;
  public setVisibility(visible: boolean): void;
  
  // State methods
  public getState(): { /* water properties */ };
  
  // Cleanup
  public dispose(): void;
}
```

This facade provides several benefits:
1. **Simplified Interface**: Hides complex Three.js water implementation details
2. **Error Handling**: Includes comprehensive error handling with fallbacks
3. **Performance Options**: Provides quality settings for different performance levels
4. **Resource Management**: Properly manages Three.js resources
5. **Consistent API**: Follows the same pattern as other facade classes

## Performance Optimization

The rendering architecture includes several performance optimizations:

1. **Level of Detail (LOD)**: Simplify geometry based on distance
2. **Object Pooling**: Reuse 3D objects instead of creating new ones
3. **Texture Atlasing**: Combine textures to reduce draw calls
4. **Frustum Culling**: Only render objects in the camera's view
5. **Throttling**: Limit update frequency for non-critical operations
6. **Lazy Loading**: Load assets only when needed
7. **Memory Management**: Properly dispose of unused resources
8. **Geometry Sharing**: Cache and reuse similar geometries between objects
8. **Geometry Sharing**: Cache and reuse similar geometries between objects

## Memory Management

Proper memory management is critical for 3D applications. The architecture includes:

1. **Resource Disposal**: Dispose of geometries, materials, and textures
2. **Reference Clearing**: Clear references to unused objects
3. **Garbage Collection Hints**: Help the garbage collector identify unused objects
4. **Texture Compression**: Use compressed textures when possible
5. **Geometry Sharing**: Share geometries between similar objects

## Error Handling

The rendering architecture includes robust error handling with multiple layers of protection:

1. **Graceful Degradation**: Falls back to simpler rendering when errors occur
   - Progressive fallback modes from detailed to simplified representations
   - Automatic switching to wireframe mode when textures fail
   - Fallback to colored boxes when geometry creation fails

2. **Error Recovery**: Actively attempts to recover from rendering errors
   - Scheduled recovery attempts for failed polygon rendering
   - Automatic retry of texture loading with simplified formats
   - Memory leak prevention during error states

3. **Error Logging**: Comprehensive logging of rendering errors
   - Categorized error types for better diagnostics
   - Context-aware error messages with entity IDs
   - Error rate tracking to detect systemic issues

4. **User Feedback**: Provides appropriate feedback when rendering fails
   - Visual indicators for fallback rendering modes
   - Console warnings for developers
   - Performance metrics to identify bottlenecks

5. **Fallback Modes**: Implements progressive fallback modes for critical components
   - Simplified map representation when critical rendering fails
   - Minimal wireframe representation as last resort
   - Placeholder textures during loading

6. **Self-Healing**: Components attempt to recover from errors automatically
   - Periodic recovery attempts for failed entities
   - Automatic texture regeneration when loading fails
   - Resource cleanup to prevent memory leaks

7. **Isolation**: Errors in one component don't crash the entire application
   - Error boundaries around critical rendering components
   - Independent polygon rendering with failure isolation
   - Shared resource management with redundancy

8. **Error Handling Utilities**: Reusable error handling patterns
   - `withErrorHandling` wrapper for consistent error handling
   - `RenderingErrorHandler` singleton for centralized error management
   - Fallback geometry and material generators

## Road Creation System

The road creation system follows a layered architecture to separate UI concerns from Three.js rendering:

```typescript
// RoadCreatorFacade handles low-level Three.js operations
export class RoadCreatorFacade {
  constructor(scene: THREE.Scene, camera: THREE.PerspectiveCamera);
  
  // Mouse interaction
  public updateMousePosition(clientX: number, clientY: number): void;
  public findIntersection(): THREE.Vector3 | null;
  
  // Road creation
  public createIndicatorMesh(position: THREE.Vector3, isSnapped?: boolean): void;
  public createRoadMesh(roadPoints: THREE.Vector3[], curvature: number): THREE.Mesh | null;
  public findSnapPoint(position: THREE.Vector3, existingPoints: THREE.Vector3[]): THREE.Vector3 | null;
  
  // Cleanup
  public dispose(): void;
}

// RoadCreationManager coordinates between UI and Three.js
export class RoadCreationManager {
  constructor(scene: THREE.Scene, camera: THREE.PerspectiveCamera);
  
  // Public API for UI component
  public updateMousePosition(clientX: number, clientY: number): void;
  public handleClick(): THREE.Vector3 | null;
  public removeLastPoint(): boolean;
  public setCurvature(value: number): void;
  public getPoints(): THREE.Vector3[];
  public getSnapPoint(): THREE.Vector3 | null;
  public clearPoints(): void;
  public dispose(): void;
  
  // Private implementation
  private updateRoadPreview(): void;
  private findDockSnapPoint(position: THREE.Vector3): THREE.Vector3 | null;
}

// RoadCreator component focuses solely on UI concerns
const RoadCreator: React.FC<RoadCreatorProps> = ({
  scene,
  camera,
  active,
  onComplete,
  onCancel
}) => {
  // UI state management
  const [curvature, setCurvature] = useState<number>(0.5);
  const [pointCount, setPointCount] = useState<number>(0);
  
  // Use the manager for coordinating with Three.js
  const managerRef = useRef<RoadCreationManager | null>(null);
  
  // UI rendering
  return (
    <div className="road-creator-ui">
      {/* UI controls */}
    </div>
  );
};
```

## Dock Creation System

The dock creation system follows a similar layered architecture:

```typescript
// DockCreationManager coordinates between UI and Three.js
export class DockCreationManager {
  constructor(scene: THREE.Scene, camera: THREE.PerspectiveCamera);
  
  // Public API for UI component
  public updateMousePosition(clientX: number, clientY: number): void;
  public getPreviewPosition(): THREE.Vector3 | null;
  public getAdjacentLandId(): string | null;
  public updateRotation(rotation: number): void;
  public dispose(): void;
  
  // Private implementation
  private createPreviewMesh(): void;
  private updatePreviewPosition(): void;
}

// WaterEdgeDetector helps find valid dock placement locations
export class WaterEdgeDetector {
  constructor(scene: THREE.Scene);
  
  public findNearestWaterEdge(position: THREE.Vector3): { 
    position: THREE.Vector3 | null; 
    landId: string | null 
  };
  
  private getWaterEdges(polygon: any): { start: THREE.Vector3, end: THREE.Vector3 }[];
  private isWaterEdge(polygon: any, start: any, end: any): boolean;
  private getClosestPointOnEdge(start: THREE.Vector3, end: THREE.Vector3, point: THREE.Vector3): THREE.Vector3;
}

// DockCreator component focuses solely on UI concerns
const DockCreator: React.FC<DockCreatorProps> = ({
  scene,
  camera,
  active,
  onComplete,
  onCancel
}) => {
  // UI state management
  const [previewPosition, setPreviewPosition] = useState<THREE.Vector3 | null>(null);
  const [previewRotation, setPreviewRotation] = useState<number>(0);
  
  // Use the manager for coordinating with Three.js
  const managerRef = useRef<DockCreationManager | null>(null);
  
  // UI rendering
  return (
    <div className="dock-creator-ui">
      {/* UI controls */}
    </div>
  );
};
```

This three-layer architecture provides several benefits:
1. **Separation of Concerns**: UI logic is separated from Three.js implementation
2. **Testability**: Each layer can be tested independently
3. **Maintainability**: Changes to one layer don't affect others
4. **Reusability**: The facade and manager can be reused with different UI components

### Error Handling Example: CloudSystem

The `CloudSystem` class demonstrates comprehensive error handling:

```typescript
// CloudSystem error handling features
class CloudSystem {
  private inFallbackMode: boolean = false;
  private recoveryAttempts: number = 0;
  
  // Graceful degradation with fallbacks
  private loadCloudTexture(): void {
    textureLoader.load(
      '/textures/cloud.png',
      (texture) => { /* Success handler */ },
      undefined,
      (error) => {
        // Try fallback texture
        textureLoader.load(
          'fallback-texture.png',
          (fallbackTexture) => { /* Success handler */ },
          undefined,
          (fallbackError) => {
            // Create canvas texture as last resort
            this.createCanvasTexture();
          }
        );
      }
    );
  }
  
  // Self-healing with recovery attempts
  public update(time: number): void {
    // Attempt recovery from fallback mode
    if (this.inFallbackMode && 
        this.recoveryAttempts < this.maxRecoveryAttempts && 
        time - this.lastRecoveryTime > this.recoveryInterval) {
      
      this.lastRecoveryTime = time;
      this.recoveryAttempts++;
      this.loadCloudTexture(); // Try to recover
    }
    
    // Continue with normal update...
  }
  
  // Minimal fallback implementation
  private createMinimalClouds(): void {
    // Create simple clouds when all else fails
    const material = new THREE.MeshBasicMaterial({
      color: 0xffffff,
      transparent: true,
      opacity: 0.5
    });
    
    // Create just a few simple clouds
    for (let i = 0; i < 5; i++) {
      // Create minimal representation...
    }
  }
}
```

## Extensibility

The rendering architecture is designed to be extensible:

1. **Plugin System**: Add new rendering features through plugins
2. **Custom Shaders**: Support custom shaders for special effects
3. **Custom Materials**: Support custom materials for unique visuals
4. **Custom Geometries**: Support custom geometries for specialized objects
5. **Custom Effects**: Support custom post-processing effects
