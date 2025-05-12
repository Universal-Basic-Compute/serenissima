# Income Visualization Architecture

The income visualization system in La Serenissima follows a layered architecture with clear separation of concerns:

1. **Data Layer**: Managed by `IncomeDataService`
2. **Visualization Layer**: Implemented by `IncomePolygonRenderer`
3. **Color Calculation**: Handled by utility functions in `colorUtils.ts`
4. **Event-Based Updates**: Using the application's event bus system
5. **Navigation Integration**: Connected with land and water navigation systems

This architecture ensures that income data management is decoupled from its visualization, making the system more maintainable and extensible.

## Data Layer: IncomeDataService

The `IncomeDataService` is a singleton service that manages all income data:

```typescript
export class IncomeDataService {
  private static instance: IncomeDataService;
  private incomeData: Map<string, number> = new Map();
  private minIncome: number = 0;
  private maxIncome: number = 1000; // Default max income
  
  // Methods for data access and manipulation
  public getIncome(polygonId: string): number | undefined { /* ... */ }
  public getAllIncomeData(): Map<string, number> { /* ... */ }
  public getMinIncome(): number { /* ... */ }
  public getMaxIncome(): number { /* ... */ }
  
  // Methods for data loading and generation
  public async loadIncomeData(): Promise<void> { /* ... */ }
  public generateLastIncomeData(polygons?: any[]): void { /* ... */ }
  
  // Methods for data updates
  public setIncomeData(data: IncomeData[]): void { /* ... */ }
  public setIncome(polygonId: string, income: number): void { /* ... */ }
}
```

Key responsibilities:
- Stores income data for all land parcels
- Tracks minimum and maximum income values for normalization
- Provides methods to access and update income data
- Loads income data from the server or generates simulated data
- Emits events when income data changes

## Visualization Layer: IncomePolygonRenderer

The `IncomePolygonRenderer` is responsible for visualizing income data as colors on the map:

```typescript
export class IncomePolygonRenderer {
  private scene: THREE.Scene;
  private polygons: any[];
  private bounds: any;
  private incomeMeshes: THREE.Mesh[] = [];
  
  // Rendering methods
  private renderIncomePolygons() { /* ... */ }
  public updateIncomeVisualization() { /* ... */ }
  
  // Visibility control
  public setVisible(visible: boolean) { /* ... */ }
}
```

Key responsibilities:
- Creates and manages 3D meshes for income visualization
- Positions these meshes slightly above the land layer
- Applies income-based colors to the meshes
- Updates visualization when income data changes
- Controls visibility of income visualization

## Color Calculation: colorUtils.ts

The `colorUtils.ts` module provides utilities for calculating colors based on income values:

```typescript
export function getIncomeBasedColor(income: number, config: Partial<ColorScaleConfig> = {}): THREE.Color {
  // Merge provided config with defaults
  const fullConfig: ColorScaleConfig = {
    ...DEFAULT_COLOR_SCALE,
    ...config
  };
  
  const { minIncome, maxIncome, lowIncomeColor, midIncomeColor, highIncomeColor } = fullConfig;
  
  // Normalize income to a 0-1 scale
  const normalizedIncome = Math.min(Math.max((income - minIncome) / (maxIncome - minIncome), 0), 1);
  
  // Map the normalized income to our color scale
  const resultColor = new THREE.Color();
  
  if (normalizedIncome >= 0.5) {
    // Map from yellow to red
    const t = (normalizedIncome - 0.5) * 2; // Scale 0.5-1.0 to 0-1
    return resultColor.lerpColors(midIncomeColor, highIncomeColor, t);
  } else {
    // Map from green to yellow
    const t = normalizedIncome * 2; // Scale 0-0.5 to 0-1
    return resultColor.lerpColors(lowIncomeColor, midIncomeColor, t);
  }
}
```

Key features:
- Uses a three-point color scale (green → yellow → red)
- Normalizes income values based on min/max range
- Supports customization of color scale parameters
- Returns THREE.Color objects ready for use in materials

## Event-Based Updates

The system uses an event bus for communication between components:

```typescript
export const EventTypes = {
  // ... other events
  INCOME_DATA_UPDATED: 'incomeDataUpdated',
  POLYGON_INCOME_UPDATED: 'polygonIncomeUpdated'
};
```

When income data changes, events are emitted:

```typescript
// From IncomeDataService
eventBus.emit(EventTypes.INCOME_DATA_UPDATED, {
  minIncome: this.minIncome,
  maxIncome: this.maxIncome
});

// For individual polygon updates
eventBus.emit(EventTypes.POLYGON_INCOME_UPDATED, {
  polygonId,
  income,
  minIncome: this.minIncome,
  maxIncome: this.maxIncome
});
```

Components listen for these events to update their visualizations:

```typescript
// In component
useEffect(() => {
  // Handle income data updates
  const handleIncomeDataUpdated = (data: any) => {
    // Update the income visualization if we're in land view
    if (incomeRendererRef.current && activeView === 'land') {
      incomeRendererRef.current.updateIncomeVisualization();
    }
  };
  
  // Subscribe to income data events
  const incomeDataSubscription = eventBus.subscribe(
    EventTypes.INCOME_DATA_UPDATED, 
    handleIncomeDataUpdated
  );
  
  // Cleanup subscriptions
  return () => {
    incomeDataSubscription.unsubscribe();
  };
}, [activeView]);
```

## Integration with Main Rendering Pipeline

The income visualization is integrated with the main rendering pipeline:

1. **Initialization**: The `IncomePolygonRenderer` is created when the land view is active
2. **View Mode Changes**: Income visualization is shown/hidden based on active view
3. **Cleanup**: Resources are properly disposed when components unmount

## Rendering Process

The income visualization rendering process follows these steps:

1. **Data Retrieval**: Get income data from `IncomeDataService`
2. **Color Calculation**: Calculate color based on income value
3. **Material Creation**: Create a material with the calculated color
4. **Mesh Creation**: Create a mesh for each polygon
5. **Scene Addition**: Add the mesh to the scene

## Update Process

When income data changes, the visualization is updated:

1. **Event Emission**: `IncomeDataService` emits an event
2. **Event Handling**: Components listen for the event
3. **Visualization Update**: `IncomePolygonRenderer` updates the visualization

## Benefits of This Architecture

1. **Separation of Concerns**: Data management is separate from visualization
2. **Loose Coupling**: Components communicate through events, not direct references
3. **Reusability**: Color calculation utilities can be used elsewhere
4. **Maintainability**: Each component has a clear responsibility
5. **Performance**: Visualization updates only when necessary
6. **Extensibility**: New visualization modes can be added without changing the data layer
