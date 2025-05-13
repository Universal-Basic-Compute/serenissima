# Building Creation and Display Architecture

This document outlines the architecture for building creation, placement, and display in La Serenissima, focusing on the components, data flow, and integration with existing systems.

## Overview

The building system allows players to browse, place, and manage buildings in the 3D world. It follows a layered architecture with clear separation between UI components, business logic, and 3D rendering.

## System Components

```
┌─────────────────────────────────────────────────────────────────────────┐
│                           Building System                                │
└───────────────┬─────────────────────────────────────┬───────────────────┘
                │                                     │
┌───────────────▼───────────────┐     ┌───────────────▼───────────────────┐
│      UI Components            │     │      Domain Logic                  │
│                               │     │                                    │
│  ┌─────────────────────────┐  │     │  ┌────────────────────────────┐   │
│  │     BuildingMenu        │  │     │  │     BuildingService        │   │
│  └─────────────────────────┘  │     │  └────────────────────────────┘   │
│                               │     │                                    │
│  ┌─────────────────────────┐  │     │  ┌────────────────────────────┐   │
│  │  BuildingModelViewer    │  │     │  │     BuildingStore          │   │
│  └─────────────────────────┘  │     │  └────────────────────────────┘   │
│                               │     │                                    │
│  ┌─────────────────────────┐  │     │  ┌────────────────────────────┐   │
│  │   PlaceableBuilding     │  │     │  │     BuildingRenderer       │   │
│  └─────────────────────────┘  │     │  └────────────────────────────┘   │
│                               │     │                                    │
│  ┌─────────────────────────┐  │     │  ┌────────────────────────────┐   │
│  │   BuildingsToolbar      │  │     │  │     BuildingPlacement      │   │
│  └─────────────────────────┘  │     │  └────────────────────────────┘   │
└───────────────────────────────┘     └────────────────────────────────────┘
                │                                     │
                │                                     │
┌───────────────▼─────────────────────────────────────▼───────────────────┐
│                         Integration Layer                                │
│                                                                          │
│  ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────────────┐  │
│  │  Event System   │  │  State Store    │  │  Three.js Integration   │  │
│  └─────────────────┘  └─────────────────┘  └─────────────────────────┘  │
└─────────────────────────────────────────────────────────────────────────┘
```

## Component Responsibilities

### UI Components

1. **BuildingMenu**: Displays available buildings categorized by type, allows selection and provides building details.
   - Renders building categories and subcategories
   - Shows building details when selected
   - Provides interface for building placement
   - Uses the `useBuildingMenu` hook for state management

2. **BuildingModelViewer**: Renders 3D models of buildings with different variants.
   - Loads and displays 3D models using Three.js
   - Supports different model variants (seasonal, damaged, etc.)
   - Provides interactive rotation and zoom
   - Handles loading states and errors gracefully

3. **PlaceableBuilding**: Handles the UI for placing buildings in the 3D world.
   - Follows cursor movement for placement preview
   - Shows valid/invalid placement indicators
   - Handles click events for final placement
   - Supports rotation and positioning

4. **BuildingsToolbar**: Provides tools for building-related actions.
   - Buttons for creating roads, docks, and other infrastructure
   - Toggle buttons for different building modes
   - Integration with other building-related tools

### Domain Logic

1. **BuildingService**: Manages building data and operations.
   - Loads building definitions from JSON files
   - Provides methods for building placement and retrieval
   - Handles server communication for persistent storage
   - Manages specialized building types (docks, etc.)

2. **BuildingStore**: Centralized state management for buildings.
   - Stores available building categories and types
   - Tracks selected buildings and variants
   - Manages building placement state
   - Provides actions for state manipulation

3. **BuildingRenderer**: Handles 3D rendering of placed buildings.
   - Creates and manages 3D meshes for buildings
   - Updates building visuals based on state changes
   - Handles level of detail for performance
   - Manages building animations and effects

4. **BuildingPlacement**: Handles the logic for valid building placement.
   - Checks placement validity against terrain and other buildings
   - Handles snapping to grid or other objects
   - Manages building rotation and orientation
   - Provides feedback on placement validity

### Integration Layer

1. **Event System**: Facilitates communication between components.
   - Building selection events
   - Building placement events
   - Building state change events
   - Integration with global event bus

2. **State Store**: Manages global application state.
   - Building-related state in the global store
   - Integration with other state domains
   - Persistence of building state

3. **Three.js Integration**: Connects with the 3D rendering system.
   - Scene management for building objects
   - Camera and controls integration
   - Raycasting for building selection
   - Performance optimization for building rendering

## Data Flow

### Building Selection and Placement Flow

```
┌──────────────┐    ┌───────────────┐    ┌────────────────┐    ┌────────────────┐
│ BuildingMenu │───►│ BuildingStore │───►│ BuildingService│───►│PlaceableBuilding│
└──────────────┘    └───────────────┘    └────────────────┘    └────────────────┘
                           │                                           │
                           ▼                                           ▼
                    ┌───────────────┐                          ┌────────────────┐
                    │  Event Bus    │◄─────────────────────────┤ Placement Event│
                    └───────────────┘                          └────────────────┘
                           │
                           ▼
                    ┌───────────────┐    ┌────────────────┐
                    │BuildingRenderer│───►│  Three.js Scene│
                    └───────────────┘    └────────────────┘
```

1. User selects a building in the BuildingMenu
2. Selection is stored in BuildingStore
3. BuildingService prepares the building data
4. PlaceableBuilding component shows placement preview
5. User places the building, triggering a placement event
6. Event bus notifies BuildingRenderer
7. BuildingRenderer adds the building to the Three.js scene

### Building Data Loading Flow

```
┌──────────────┐    ┌───────────────┐    ┌────────────────┐
│  App Init    │───►│BuildingService│───►│  Fetch JSON    │
└──────────────┘    └───────────────┘    └────────────────┘
                           │                     │
                           │                     ▼
                           │             ┌────────────────┐
                           │             │ Parse Building │
                           │             │   Definitions  │
                           │             └────────────────┘
                           │                     │
                           ▼                     ▼
                    ┌───────────────┐    ┌────────────────┐
                    │ BuildingStore │◄───┤ Categorized    │
                    │               │    │ Building Data  │
                    └───────────────┘    └────────────────┘
                           │
                           ▼
                    ┌───────────────┐
                    │ BuildingMenu  │
                    │ (UI Update)   │
                    └───────────────┘
```

1. Application initializes
2. BuildingService is triggered to load building data
3. Service fetches JSON files containing building definitions
4. Building definitions are parsed and categorized
5. Data is stored in BuildingStore
6. BuildingMenu UI updates to show available buildings

## State Management

The building system uses Zustand for state management:

```typescript
interface BuildingState {
  // Building catalog
  categories: BuildingCategory[];
  
  // Selection state
  selectedBuilding: Building | null;
  selectedVariant: string;
  availableVariants: string[];
  
  // Placement state
  placeableBuilding: { name: string; variant: string } | null;
  
  // Loading state
  loading: boolean;
  error: string | null;
}

interface BuildingActions {
  // Data loading
  loadBuildingCategories: () => Promise<BuildingCategory[]>;
  getBuildingCategories: () => Promise<BuildingCategory[]>;
  getBuildingByName: (name: string) => Promise<Building | null>;
  getBuildingVariants: (buildingName: string) => Promise<string[]>;
  
  // Selection actions
  setSelectedBuilding: (building: Building | null) => void;
  setSelectedVariant: (variant: string) => void;
  setAvailableVariants: (variants: string[]) => void;
  
  // Placement actions
  setPlaceableBuilding: (building: { name: string; variant: string } | null) => void;
}
```

## Integration with Existing Systems

### Land System Integration

Buildings are placed on land parcels and interact with the land ownership system:

1. **Placement Validation**: Buildings can only be placed on valid land parcels
2. **Ownership Checks**: Buildings can only be placed on land owned by the player
3. **Land Value Impact**: Buildings affect the value of the land they're placed on
4. **Visual Integration**: Buildings visually integrate with the land terrain

### Economy System Integration

Buildings are part of the economic simulation:

1. **Construction Costs**: Buildings require resources and ducats to construct
2. **Maintenance Costs**: Buildings have ongoing maintenance costs
3. **Income Generation**: Buildings can generate income for their owners
4. **Resource Production/Consumption**: Buildings can produce or consume resources

### Road and Transportation Integration

Buildings connect with the road and transportation systems:

1. **Road Connections**: Buildings can connect to roads for access
2. **Dock Connections**: Special buildings (docks) connect water and land transportation
3. **Transportation Effects**: Building placement affects transportation efficiency
4. **Access Requirements**: Some buildings require road or water access

## Performance Considerations

### Model Loading and Rendering

1. **Asynchronous Loading**: Building models are loaded asynchronously to prevent UI blocking
2. **Level of Detail (LOD)**: Buildings use different detail levels based on camera distance
3. **Instancing**: Similar buildings use instanced rendering for performance
4. **Texture Atlasing**: Building textures are combined into atlases to reduce draw calls
5. **Occlusion Culling**: Buildings outside the view frustum or occluded are not rendered

### Memory Management

1. **Model Caching**: Building models are cached to prevent redundant loading
2. **Texture Sharing**: Buildings share textures when possible
3. **Geometry Reuse**: Common building geometries are reused
4. **Resource Disposal**: Unused resources are properly disposed to prevent memory leaks

### UI Performance

1. **Virtualized Lists**: Building lists use virtualization for large catalogs
2. **Lazy Loading**: Building details are loaded only when needed
3. **Throttled Updates**: UI updates are throttled during building placement
4. **Optimized Rendering**: Building preview uses simplified models during placement

## Error Handling

1. **Model Loading Errors**: Fallback to simplified models when loading fails
2. **Placement Errors**: Clear visual feedback for invalid placements
3. **Data Loading Errors**: Graceful degradation with cached data
4. **Rendering Errors**: Fallback rendering modes for problematic buildings

## Future Extensions

1. **Building Upgrades**: System for upgrading buildings to higher tiers
2. **Building Customization**: Allow players to customize building appearances
3. **Building Damage and Repair**: System for building damage and maintenance
4. **Interior Spaces**: Support for building interiors and interior gameplay
5. **Building Effects**: Visual effects for building activities (smoke, light, etc.)
6. **Additional Placeable Objects**: Support for more types of placeable objects using the unified PlaceableObjectManager
7. **Advanced Constraints**: More sophisticated placement constraints based on terrain, proximity, and other factors

# Building Creation and Display Architecture

This document outlines the architecture for building creation, placement, and display in La Serenissima, focusing on the components, data flow, and integration with existing systems.

## Overview

The building system allows players to browse, place, and manage buildings in the 3D world. It follows a layered architecture with clear separation between UI components, business logic, and 3D rendering.

## System Components

```
┌─────────────────────────────────────────────────────────────────────────┐
│                           Building System                                │
└───────────────┬─────────────────────────────────────┬───────────────────┘
                │                                     │
┌───────────────▼───────────────┐     ┌───────────────▼───────────────────┐
│      UI Components            │     │      Domain Logic                  │
│                               │     │                                    │
│  ┌─────────────────────────┐  │     │  ┌────────────────────────────┐   │
│  │     BuildingMenu        │  │     │  │     BuildingService        │   │
│  └─────────────────────────┘  │     │  └────────────────────────────┘   │
│                               │     │                                    │
│  ┌─────────────────────────┐  │     │  ┌────────────────────────────┐   │
│  │  BuildingModelViewer    │  │     │  │     BuildingStore          │   │
│  └─────────────────────────┘  │     │  └────────────────────────────┘   │
│                               │     │                                    │
│  ┌─────────────────────────┐  │     │  ┌────────────────────────────┐   │
│  │   PlaceableBuilding     │  │     │  │     BuildingRenderer       │   │
│  └─────────────────────────┘  │     │  └────────────────────────────┘   │
│                               │     │                                    │
│  ┌─────────────────────────┐  │     │  ┌────────────────────────────┐   │
│  │   BuildingsToolbar      │  │     │  │     BuildingPlacement      │   │
│  └─────────────────────────┘  │     │  └────────────────────────────┘   │
└───────────────────────────────┘     └────────────────────────────────────┘
                │                                     │
                │                                     │
┌───────────────▼─────────────────────────────────────▼───────────────────┐
│                         Integration Layer                                │
│                                                                          │
│  ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────────────┐  │
│  │  Event System   │  │  State Store    │  │  Three.js Integration   │  │
│  └─────────────────┘  └─────────────────┘  └─────────────────────────┘  │
└─────────────────────────────────────────────────────────────────────────┘
```

## Component Responsibilities

### UI Components

1. **BuildingMenu**: Displays available buildings categorized by type, allows selection and provides building details.
   - Renders building categories and subcategories
   - Shows building details when selected
   - Provides interface for building placement
   - Uses the `useBuildingMenu` hook for state management

2. **BuildingModelViewer**: Renders 3D models of buildings with different variants.
   - Loads and displays 3D models using Three.js
   - Supports different model variants (seasonal, damaged, etc.)
   - Provides interactive rotation and zoom
   - Handles loading states and errors gracefully

3. **PlaceableBuilding**: Handles the UI for placing buildings in the 3D world.
   - Follows cursor movement for placement preview
   - Shows valid/invalid placement indicators
   - Handles click events for final placement
   - Supports rotation and positioning

4. **BuildingsToolbar**: Provides tools for building-related actions.
   - Buttons for creating roads, docks, and other infrastructure
   - Toggle buttons for different building modes
   - Integration with other building-related tools

5. **PlaceableObjectManager**: Unified component for placing objects.
   - Handles placement of buildings
   - Applies type-specific constraints and validation
   - Provides consistent UI for object placement
   - Supports rotation and positioning

### Domain Logic

1. **BuildingService**: Manages building data and operations.
   - Loads building definitions from JSON files
   - Provides methods for building placement and retrieval
   - Handles server communication for persistent storage
   - Manages specialized building types (docks, etc.)

2. **BuildingStore**: Centralized state management for buildings.
   - Stores available building categories and types
   - Tracks selected buildings and variants
   - Manages building placement state
   - Provides actions for state manipulation

3. **BuildingRenderer**: Handles 3D rendering of placed buildings.
   - Creates and manages 3D meshes for buildings
   - Updates building visuals based on state changes
   - Handles level of detail for performance
   - Manages building animations and effects

4. **BuildingPlacement**: Handles the logic for valid building placement.
   - Checks placement validity against terrain and other buildings
   - Handles snapping to grid or other objects
   - Manages building rotation and orientation
   - Provides feedback on placement validity

### Integration Layer

1. **Event System**: Facilitates communication between components.
   - Building selection events
   - Building placement events
   - Building state change events
   - Integration with global event bus

2. **State Store**: Manages global application state.
   - Building-related state in the global store
   - Integration with other state domains
   - Persistence of building state

3. **Three.js Integration**: Connects with the 3D rendering system.
   - Scene management for building objects
   - Camera and controls integration
   - Raycasting for building selection
   - Performance optimization for building rendering

## Data Flow

### Building Selection and Placement Flow

```
┌──────────────┐    ┌───────────────┐    ┌────────────────┐    ┌────────────────┐
│ BuildingMenu │───►│ BuildingStore │───►│ BuildingService│───►│PlaceableBuilding│
└──────────────┘    └───────────────┘    └────────────────┘    └────────────────┘
                           │                                           │
                           ▼                                           ▼
                    ┌───────────────┐                          ┌────────────────┐
                    │  Event Bus    │◄─────────────────────────┤ Placement Event│
                    └───────────────┘                          └────────────────┘
                           │
                           ▼
                    ┌───────────────┐    ┌────────────────┐
                    │BuildingRenderer│───►│  Three.js Scene│
                    └───────────────┘    └────────────────┘
```

1. User selects a building in the BuildingMenu
2. Selection is stored in BuildingStore
3. BuildingService prepares the building data
4. PlaceableBuilding component shows placement preview
5. User places the building, triggering a placement event
6. Event bus notifies BuildingRenderer
7. BuildingRenderer adds the building to the Three.js scene

### Building Data Loading Flow

```
┌──────────────┐    ┌───────────────┐    ┌────────────────┐
│  App Init    │───►│BuildingService│───►│  Fetch JSON    │
└──────────────┘    └───────────────┘    └────────────────┘
                           │                     │
                           │                     ▼
                           │             ┌────────────────┐
                           │             │ Parse Building │
                           │             │   Definitions  │
                           │             └────────────────┘
                           │                     │
                           ▼                     ▼
                    ┌───────────────┐    ┌────────────────┐
                    │ BuildingStore │◄───┤ Categorized    │
                    │               │    │ Building Data  │
                    └───────────────┘    └────────────────┘
                           │
                           ▼
                    ┌───────────────┐
                    │ BuildingMenu  │
                    │ (UI Update)   │
                    └───────────────┘
```

1. Application initializes
2. BuildingService is triggered to load building data
3. Service fetches JSON files containing building definitions
4. Building definitions are parsed and categorized
5. Data is stored in BuildingStore
6. BuildingMenu UI updates to show available buildings

## State Management

The building system uses Zustand for state management:

```typescript
interface BuildingState {
  // Building catalog
  categories: BuildingCategory[];
  
  // Selection state
  selectedBuilding: Building | null;
  selectedVariant: string;
  availableVariants: string[];
  
  // Placement state
  placeableBuilding: { name: string; variant: string } | null;
  
  // Loading state
  loading: boolean;
  error: string | null;
}

interface BuildingActions {
  // Data loading
  loadBuildingCategories: () => Promise<BuildingCategory[]>;
  getBuildingCategories: () => Promise<BuildingCategory[]>;
  getBuildingByName: (name: string) => Promise<Building | null>;
  getBuildingVariants: (buildingName: string) => Promise<string[]>;
  
  // Selection actions
  setSelectedBuilding: (building: Building | null) => void;
  setSelectedVariant: (variant: string) => void;
  setAvailableVariants: (variants: string[]) => void;
  
  // Placement actions
  setPlaceableBuilding: (building: { name: string; variant: string } | null) => void;
}
```

## Integration with Existing Systems

### Land System Integration

Buildings are placed on land parcels and interact with the land ownership system:

1. **Placement Validation**: Buildings can only be placed on valid land parcels
2. **Ownership Checks**: Buildings can only be placed on land owned by the player
3. **Land Value Impact**: Buildings affect the value of the land they're placed on
4. **Visual Integration**: Buildings visually integrate with the land terrain

### Economy System Integration

Buildings are part of the economic simulation:

1. **Construction Costs**: Buildings require resources and ducats to construct
2. **Maintenance Costs**: Buildings have ongoing maintenance costs
3. **Income Generation**: Buildings can generate income for their owners
4. **Resource Production/Consumption**: Buildings can produce or consume resources

### Road and Transportation Integration

Buildings connect with the road and transportation systems:

1. **Road Connections**: Buildings can connect to roads for access
2. **Dock Connections**: Special buildings (docks) connect water and land transportation
3. **Transportation Effects**: Building placement affects transportation efficiency
4. **Access Requirements**: Some buildings require road or water access

## Performance Considerations

### Model Loading and Rendering

1. **Asynchronous Loading**: Building models are loaded asynchronously to prevent UI blocking
2. **Level of Detail (LOD)**: Buildings use different detail levels based on camera distance
3. **Instancing**: Similar buildings use instanced rendering for performance
4. **Texture Atlasing**: Building textures are combined into atlases to reduce draw calls
5. **Occlusion Culling**: Buildings outside the view frustum or occluded are not rendered

### Memory Management

1. **Model Caching**: Building models are cached to prevent redundant loading
2. **Texture Sharing**: Buildings share textures when possible
3. **Geometry Reuse**: Common building geometries are reused
4. **Resource Disposal**: Unused resources are properly disposed to prevent memory leaks

### UI Performance

1. **Virtualized Lists**: Building lists use virtualization for large catalogs
2. **Lazy Loading**: Building details are loaded only when needed
3. **Throttled Updates**: UI updates are throttled during building placement
4. **Optimized Rendering**: Building preview uses simplified models during placement

## Error Handling

1. **Model Loading Errors**: Fallback to simplified models when loading fails
2. **Placement Errors**: Clear visual feedback for invalid placements
3. **Data Loading Errors**: Graceful degradation with cached data
4. **Rendering Errors**: Fallback rendering modes for problematic buildings

## Future Extensions

1. **Building Upgrades**: System for upgrading buildings to higher tiers
2. **Building Customization**: Allow players to customize building appearances
3. **Building Damage and Repair**: System for building damage and maintenance
4. **Interior Spaces**: Support for building interiors and interior gameplay
5. **Building Effects**: Visual effects for building activities (smoke, light, etc.)
