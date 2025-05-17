# Building System Architecture

The building system in La Serenissima allows players to browse, place, and manage buildings in the 3D world. This document outlines the architecture, components, and workflows of the building system.

## System Overview

The building system follows a layered architecture with clear separation between UI components, business logic, and 3D rendering:

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

## Key Components

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
   - Buttons for creating roads and other infrastructure
   - Toggle buttons for different building modes
   - Integration with other building-related tools

5. **PlaceableObjectManager**: Unified component for placing different object types.
   - Handles placement of buildings and other object types
   - Applies type-specific constraints and validation
   - Provides consistent UI for object placement
   - Supports rotation and positioning for all object types


### Domain Logic

1. **BuildingService**: Manages building data and operations.
   - Loads building definitions from JSON files
   - Provides methods for building placement and retrieval
   - Handles server communication for persistent storage
   - Manages specialized building types

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

1. Citizen selects a building in the BuildingMenu
2. Selection is stored in BuildingStore
3. BuildingService prepares the building data
4. PlaceableBuilding component shows placement preview
5. Citizen places the building, triggering a placement event
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


## Building Data Structure

Buildings are defined in JSON files organized by category and subcategory:

```
/data/buildings/
├── commercial/
│   ├── retail_shops/
│   │   ├── market_stall.json
│   │   └── ...
│   └── trade_facilities/
│       ├── trading_post.json
│       └── ...
├── residential/
│   ├── basic_residences/
│   │   ├── worker_housing.json
│   │   └── ...
│   └── noble_residences/
│       ├── nobili_palace.json
│       └── ...
└── ...
```

Each building JSON file contains:

```json
{
  "name": "Market Stall",
  "category": "Commercial",
  "subcategory": "Retail Shops",
  "tier": 1,
  "size": "Small",
  "unlockCondition": "None - available from start",
  "shortDescription": "Simple open-air selling space for basic goods and produce.",
  "fullDescription": "The humble beginning of many Venetian merchants...",
  "flavorText": "A good location, a keen eye, and a loud voice...",
  "constructionCosts": {
    "ducats": 150000,
    "timber": 20
  },
  "maintenanceCost": 1000,
  "constructionTime": 86400000,
  "incomeGeneration": 8000,
  "employmentCapacity": 1,
  "assets": {
    "models": "/assets/buildings/models/market-stall",
    "variants": ["model", "winter", "festival"],
    "thumbnail": "/assets/buildings/thumbnails/market-stall.png"
  }
}
```

## Building Models and Variants

Building models are stored as GLB files in the public directory:

```
/public/assets/buildings/models/
├── market-stall/
│   ├── model.glb       # Default model
│   ├── winter.glb      # Winter variant
│   └── festival.glb    # Festival variant
└── ...
```

The system supports multiple variants of each building model:

1. **Variant Discovery**: The API endpoint `/api/building-variants/[name]` discovers available variants
2. **Variant Selection**: Citizens can select different variants in the BuildingMenu
3. **Variant Rendering**: BuildingModelViewer loads and displays the selected variant

## API Endpoints

The building system uses several API endpoints:

1. **GET /api/buildings/[category]**: Retrieves buildings by category
2. **GET /api/building-variants/[name]**: Retrieves available variants for a building
3. **POST /api/buildings**: Creates a new building
4. **GET /api/buildings**: Retrieves all buildings (with optional type filter)
5. **GET /api/buildings/[id]**: Retrieves a specific building by ID

## Usage Examples

### Adding a Building to the Scene

```typescript
// 1. Select a building in the BuildingMenu
const building = {
  name: "Market Stall",
  category: "Commercial",
  // ...other properties
};

// 2. Set the selected building in the store
buildingStore.setSelectedBuilding(building);

// 3. Set the building for placement
buildingStore.setPlaceableBuilding({
  name: "market-stall",
  variant: "model"
});

// 4. When the citizen clicks to place the building
const position = { x: 100, y: 0, z: 100 };
buildingService.saveBuilding({
  type: "market-stall",
  land_id: "polygon-123",
  position: position,
  rotation: 0,
  variant: "model"
});

// 5. Emit event to notify other components
eventBus.emit(EventTypes.BUILDING_PLACED, {
  type: "market-stall",
  position: position,
  rotation: 0,
  variant: "model"
});
```


## Future Enhancements

1. **Building Upgrades**: System for upgrading buildings to higher tiers
2. **Building Customization**: Allow players to customize building appearances
3. **Building Damage and Repair**: System for building damage and maintenance
4. **Interior Spaces**: Support for building interiors and interior gameplay
5. **Building Effects**: Visual effects for building activities (smoke, light, etc.)
6. **Building Interactions**: Allow players to interact with buildings
7. **Building Animations**: Animate buildings based on time of day and activity
8. **Building Sounds**: Add ambient sounds to buildings
