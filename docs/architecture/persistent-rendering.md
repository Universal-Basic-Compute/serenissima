# Persistent Land and Water Rendering Architecture

## Overview

La Serenissima uses a layered rendering approach to optimize performance by ensuring that base elements (water and land) are rendered only once and persist across all view modes. This document outlines the architecture and implementation of this persistent rendering system.

## Design Principles

1. **Render Once, Display Always**: Base elements (water and land) should be rendered once and never reloaded
2. **View-Specific Overlays**: Each view mode adds its specific elements on top of the persistent base
3. **Clear Separation of Concerns**: Base rendering is separated from view-specific rendering
4. **Performance Optimization**: Minimize GPU load during view transitions
5. **Memory Efficiency**: Shared resources are loaded once and reused

## Architecture Components

### 1. BaseSceneLayer

The `BaseSceneLayer` component is responsible for rendering the persistent base elements:

```typescript
// components/PolygonViewer/BaseSceneLayer.tsx
const BaseSceneLayer: React.FC<BaseSceneLayerProps> = ({ 
  scene, 
  polygons, 
  waterQuality 
}) => {
  // References to persistent elements
  const waterRef = useRef<SimpleWater | null>(null);
  const polygonRendererRef = useRef<SimplePolygonRenderer | null>(null);
  const isInitializedRef = useRef<boolean>(false);

  // Initialize base scene elements once
  useEffect(() => {
    // Skip if already initialized or missing required props
    if (isInitializedRef.current || !scene || polygons.length === 0) return;

    // Calculate bounds for all polygons
    const bounds = calculateBounds(polygons);

    // Create water first (so it's rendered first)
    const water = new SimpleWater({
      scene,
      size: waterSize,
      quality: waterQuality,
      position: { y: 0 }
    });
    waterRef.current = water;

    // Create polygon renderer for land only
    const polygonRenderer = new SimplePolygonRenderer({
      scene,
      polygons,
      bounds,
      landOnly: true // Special mode for rendering only land
    });
    polygonRendererRef.current = polygonRenderer;

    // Mark as initialized
    isInitializedRef.current = true;

    // Emit event to notify that base scene is rendered
    eventBus.emit(EventTypes.SCENE_BASE_RENDERED, { 
      waterInitialized: true,
      landInitialized: true
    });
  }, [scene, polygons, waterQuality]);
}
```

### 2. SceneLayerManager

The `SceneLayerManager` service coordinates between the base layer and view-specific layers:

```typescript
// lib/services/SceneLayerManager.ts
export class SceneLayerManager {
  private static instance: SceneLayerManager;
  private scene: THREE.Scene | null = null;
  private baseLayerInitialized: boolean = false;
  private viewLayers: Map<string, any> = new Map();
  
  // Initialize the manager with a scene
  public initialize(scene: THREE.Scene): void {
    this.scene = scene;
    
    // Listen for base layer initialization
    eventBus.subscribe(EventTypes.SCENE_BASE_RENDERED, (data) => {
      this.baseLayerInitialized = true;
    });
  }
  
  // Check if the base layer is initialized
  public isBaseLayerInitialized(): boolean {
    return this.baseLayerInitialized;
  }
  
  // Switch to a different view
  public switchToView(viewName: string): void {
    // Hide all view layers
    this.viewLayers.forEach((layer, name) => {
      if (name !== 'baseLayerSubscription' && name !== viewName && layer.setVisible) {
        layer.setVisible(false);
      }
    });
    
    // Show the requested view layer
    const viewLayer = this.viewLayers.get(viewName);
    if (viewLayer && viewLayer.setVisible) {
      viewLayer.setVisible(true);
    }
    
    // Emit view change event
    eventBus.emit(EventTypes.VIEW_MODE_CHANGED, { viewMode: viewName });
  }
}
```

### 3. Modified SimplePolygonRenderer

The `SimplePolygonRenderer` has been modified to support land-only rendering:

```typescript
// components/PolygonViewer/SimplePolygonRenderer.ts
export default class SimplePolygonRenderer {
  // New constructor parameter
  constructor({ 
    scene, 
    polygons, 
    bounds, 
    activeView = 'land', 
    users = {},
    camera = null,
    onLandSelected = null,
    sandColor = 0xfff8e0,
    landOnly = false // New parameter
  }) {
    // ...existing initialization...
    
    // If landOnly mode, only render the land polygons
    if (landOnly) {
      this.renderLandOnly();
    } else {
      // Check textures and render normally
      this.checkTexturesAndRender();
    }
  }

  // New method for rendering land only
  private renderLandOnly(): void {
    // Create a single shared material for all polygons
    this.sharedMaterial = new THREE.MeshStandardMaterial({
      map: this.sandTexture,
      normalMap: this.sandNormalMap,
      roughnessMap: this.sandRoughnessMap,
      color: this.sandColor,
      side: THREE.DoubleSide,
      roughness: 0.8,
      metalness: 0.1,
      wireframe: false,
      flatShading: false
    });
    
    // Process each polygon - only render the land geometry
    this.polygons.forEach(polygon => {
      // ...land rendering logic...
      
      // Add to scene
      this.scene.add(mesh);
      
      // Store reference
      this.meshes.push(mesh);
    });
    
    this.hasRenderedLand = true;
  }
}
```

### 4. Modified SimpleViewer

The `SimpleViewer` component now uses the `BaseSceneLayer`:

```typescript
// components/PolygonViewer/SimpleViewer.tsx
export default function SimpleViewer({ qualityMode = 'high', waterQuality = 'high', activeView = 'land' }) {
  // ...existing code...
  
  return (
    <div className="w-screen h-screen">
      <canvas ref={canvasRef} className="w-full h-full" />
      
      {/* Base Scene Layer - persistent water and land */}
      {sceneRef.current && !loading && polygons.length > 0 && (
        <BaseSceneLayer 
          scene={sceneRef.current}
          polygons={polygons}
          waterQuality={waterQuality}
        />
      )}
      
      {/* Rest of the UI components... */}
    </div>
  );
}
```

## Rendering Process

1. **Initialization**:
   - `SimpleViewer` creates the Three.js scene, camera, and renderer
   - `BaseSceneLayer` renders the persistent water and land elements
   - `SceneLayerManager` is initialized with the scene

2. **View Switching**:
   - When the active view changes, `SceneLayerManager.switchToView()` is called
   - View-specific elements are shown/hidden as needed
   - Base elements (water and land) remain visible across all views

3. **Event Communication**:
   - `BaseSceneLayer` emits `SCENE_BASE_RENDERED` when initialization is complete
   - `SceneLayerManager` listens for this event to track base layer status
   - View components check `SceneLayerManager.isBaseLayerInitialized()` before rendering

## Benefits

1. **Performance Improvements**:
   - Base land and water are rendered only once
   - View transitions are much faster
   - Reduced GPU load during view changes
   - Smoother user experience

2. **Memory Efficiency**:
   - Textures and materials are loaded once
   - Shared resources reduce memory usage
   - Fewer objects in the scene graph

3. **Simplified Architecture**:
   - Clear separation between base and view-specific rendering
   - Easier to add new view modes
   - More maintainable codebase

4. **Improved Stability**:
   - Reduced risk of rendering errors
   - More consistent visual appearance
   - Better handling of resource loading

## Implementation Considerations

1. **Z-Fighting Prevention**:
   - Base land is positioned at y=0
   - View-specific elements are positioned slightly above (y>0)
   - Render order ensures correct layering

2. **Material Management**:
   - Base land uses a shared material for all polygons
   - View-specific elements use their own materials
   - Material properties are optimized for performance

3. **Event Coordination**:
   - Events ensure proper sequencing of rendering operations
   - Components wait for base layer before rendering view-specific elements
   - Error handling prevents cascading failures

4. **Resource Cleanup**:
   - Base elements are only cleaned up when the entire scene is destroyed
   - View-specific elements are cleaned up during view transitions
   - Memory leaks are prevented through proper disposal
