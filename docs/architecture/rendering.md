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

### InteractionManager

The `InteractionManager` class handles user interaction with 3D objects:

```typescript
export default class InteractionManager {
  constructor({
    camera,
    scene,
    polygonMeshesRef,
    activeView,
    hoveredPolygonId,
    setHoveredPolygonId,
    selectedPolygonId,
    setSelectedPolygonId
  }: InteractionManagerProps);
  
  // Interaction management
  public updateViewMode(activeView: ViewMode): void;
  public setEnabled(enabled: boolean): void;
  
  // Cleanup
  public cleanup(): void;
}
```

## Rendering Pipeline

The rendering pipeline follows these steps:

1. **Scene Setup**: Initialize Three.js scene, camera, renderer, and controls
2. **Asset Loading**: Load textures, models, and other assets
3. **Object Creation**: Create 3D objects and add them to the scene
4. **Rendering Loop**: Update and render the scene on each frame
5. **Interaction Handling**: Handle user interaction with 3D objects
6. **Cleanup**: Dispose of resources when components unmount

## Performance Optimization

The rendering architecture includes several performance optimizations:

1. **Level of Detail (LOD)**: Simplify geometry based on distance
2. **Object Pooling**: Reuse 3D objects instead of creating new ones
3. **Texture Atlasing**: Combine textures to reduce draw calls
4. **Frustum Culling**: Only render objects in the camera's view
5. **Throttling**: Limit update frequency for non-critical operations
6. **Lazy Loading**: Load assets only when needed
7. **Memory Management**: Properly dispose of unused resources

## Memory Management

Proper memory management is critical for 3D applications. The architecture includes:

1. **Resource Disposal**: Dispose of geometries, materials, and textures
2. **Reference Clearing**: Clear references to unused objects
3. **Garbage Collection Hints**: Help the garbage collector identify unused objects
4. **Texture Compression**: Use compressed textures when possible
5. **Geometry Sharing**: Share geometries between similar objects

## Error Handling

The rendering architecture includes robust error handling:

1. **Graceful Degradation**: Fall back to simpler rendering when errors occur
2. **Error Recovery**: Attempt to recover from rendering errors
3. **Error Logging**: Log rendering errors for debugging
4. **User Feedback**: Provide feedback to users when rendering fails
5. **Fallback Modes**: Implement progressive fallback modes for critical components
6. **Self-Healing**: Components attempt to recover from errors automatically
7. **Isolation**: Errors in one component don't crash the entire application

## Road Creation System

The road creation system follows the facade pattern to separate UI concerns from Three.js rendering:

```typescript
// RoadCreatorFacade handles Three.js operations
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

// RoadCreator component uses the facade for UI interactions
const RoadCreator: React.FC<RoadCreatorProps> = ({
  scene,
  camera,
  active,
  onComplete,
  onCancel
}) => {
  // UI state management
  const [points, setPoints] = useState<THREE.Vector3[]>([]);
  const [curvature, setCurvature] = useState<number>(0.5);
  
  // Use the facade for Three.js operations
  const roadCreatorRef = useRef<RoadCreatorFacade | null>(null);
  
  // UI rendering
  return (
    <div className="road-creator-ui">
      {/* UI controls */}
    </div>
  );
};
```

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
