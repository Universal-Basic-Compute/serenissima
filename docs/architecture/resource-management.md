# Resource Management Architecture

La Serenissima implements a comprehensive resource management system that allows players to collect, view, and utilize various resources throughout the game. This document outlines the architecture, components, and data flow of the resource management system.

## System Overview

The resource management system follows a layered architecture with clear separation between UI components, business logic, and data access:

```
┌─────────────────────────────────────────────────────────────────────────┐
│                        Resource Management System                        │
└───────────────┬─────────────────────────────────────┬───────────────────┘
                │                                     │
┌───────────────▼───────────────┐     ┌───────────────▼───────────────────┐
│      UI Components            │     │      Domain Logic                  │
│                               │     │                                    │
│  ┌─────────────────────────┐  │     │  ┌────────────────────────────┐   │
│  │   ResourceDropdowns     │  │     │  │     ResourceService        │   │
│  └─────────────────────────┘  │     │  └────────────────────────────┘   │
│                               │     │                                    │
│  ┌─────────────────────────┐  │     │  ┌────────────────────────────┐   │
│  │   ResourceDropdown      │  │     │  │     ResourceUtils          │   │
│  └─────────────────────────┘  │     │  └────────────────────────────┘   │
│                               │     │                                    │
│  ┌─────────────────────────┐  │     │  ┌────────────────────────────┐   │
│  │  ResourceDetailsModal   │  │     │  │     ResourceDisplayManager  │   │
│  └─────────────────────────┘  │     │  └────────────────────────────┘   │
│                               │     │                                    │
│  ┌─────────────────────────┐  │     │  ┌────────────────────────────┐   │
│  │   ResourceTree          │  │     │  │     ResourceTreeManager    │   │
│  └─────────────────────────┘  │     │  └────────────────────────────┘   │
└───────────────────────────────┘     └────────────────────────────────────┘
                │                                     │
                │                                     │
┌───────────────▼─────────────────────────────────────▼───────────────────┐
│                         Integration Layer                                │
│                                                                          │
│  ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────────────┐  │
│  │  API Endpoints  │  │  State Store    │  │  Three.js Integration   │  │
│  └─────────────────┘  └─────────────────┘  └─────────────────────────┘  │
└─────────────────────────────────────────────────────────────────────────┘
```

## Key Components

### UI Components

1. **ResourceDropdowns**: Container component that displays resource categories as dropdown menus.
   - Fetches resource data from ResourceService
   - Groups resources by category
   - Renders ResourceDropdown components for each category
   - Handles periodic refresh of resource data

2. **ResourceDropdown**: Displays resources within a specific category.
   - Shows resources grouped by subcategory
   - Displays resource icons, names, and quantities
   - Provides tooltips with resource descriptions
   - Handles resource selection to show detailed information

3. **ResourceDetailsModal**: Displays detailed information about a selected resource.
   - Shows comprehensive resource properties
   - Displays production chain information
   - Shows resource rarity and other attributes
   - Provides visual representation of the resource

4. **ResourceTree**: Visualizes resource production chains and relationships.
   - Shows hierarchical view of resource dependencies
   - Visualizes production processes
   - Allows exploration of resource relationships
   - Provides interactive navigation of the resource economy

### Domain Logic

1. **ResourceService**: Singleton service that manages resource data.
   - Loads resource definitions from API
   - Provides methods for resource retrieval and categorization
   - Manages resource counts for the current player
   - Implements caching for performance optimization

2. **ResourceUtils**: Utility functions for resource data manipulation.
   - Fetches resource data from API endpoints
   - Transforms raw data into usable formats
   - Provides helper functions for resource operations
   - Handles error cases and fallbacks

3. **ResourceDisplayManager**: Manages 3D visualization of resources on the map.
   - Creates and positions resource markers in the 3D world
   - Updates resource visibility based on view mode
   - Handles resource selection in the 3D environment
   - Manages resource clustering for performance

4. **ResourceTreeManager**: Manages the resource production tree visualization.
   - Builds the resource dependency graph
   - Calculates layout for visual representation
   - Provides data for the ResourceTree component
   - Handles resource selection and highlighting

### Integration Layer

1. **API Endpoints**: Server endpoints for resource data.
   - `/api/resources`: Retrieves all resource definitions
   - `/api/resources/counts`: Gets resource counts for a player
   - `/api/resources/[id]`: Gets detailed information about a specific resource
   - `/api/resources/tree`: Gets resource production tree data

2. **State Store**: Manages global application state related to resources.
   - Stores selected resource information
   - Tracks resource view mode
   - Maintains resource filter state
   - Provides actions for state manipulation

3. **Three.js Integration**: Connects with the 3D rendering system.
   - Creates 3D representations of resources
   - Handles resource marker positioning
   - Manages resource visibility and LOD
   - Provides interaction with resource objects in the 3D world

## Data Models

### Resource

The core Resource data model includes:

```typescript
interface Resource {
  id: string;
  name: string;
  icon: string;
  amount: number;
  category: string;
  subcategory?: string;
  description?: string;
  rarity?: string;
  productionProperties?: {
    producerBuilding?: string;
    processorBuilding?: string;
    productionComplexity?: number;
    processingComplexity?: number;
    requiredSkill?: string;
    productionTime?: number;
    processingTime?: number;
    batchSize?: number;
    inputs?: Array<{
      resource: string;
      amount: number;
      qualityImpact?: number;
    }>;
    outputs?: Array<{
      resource: string;
      amount: number;
    }>;
  };
  productionChainPosition?: {
    predecessors?: Array<{
      resource: string;
      facility?: string;
    }>;
    successors?: Array<{
      resource: string;
      facility?: string;
    }>;
  };
  baseProperties?: {
    baseValue?: number;
    weight?: number;
    volume?: number;
    stackSize?: number;
    perishable?: boolean;
    perishTime?: number;
    nutritionValue?: number;
  };
}
```

### ResourceCategory

Resources are organized into categories:

```typescript
interface ResourceCategory {
  id: string;
  name: string;
  resources: Resource[];
}
```

## Data Flow

### Resource Loading Flow

```
┌──────────────┐    ┌───────────────┐    ┌────────────────┐
│  App Init    │───►│ResourceService│───►│  Fetch API     │
└──────────────┘    └───────────────┘    └────────────────┘
                           │                     │
                           │                     ▼
                           │             ┌────────────────┐
                           │             │ Process Resource│
                           │             │    Data        │
                           │             └────────────────┘
                           │                     │
                           ▼                     ▼
                    ┌───────────────┐    ┌────────────────┐
                    │ResourceDropdowns◄───┤ Categorized    │
                    │               │    │ Resource Data  │
                    └───────────────┘    └────────────────┘
                           │
                           ▼
                    ┌───────────────┐
                    │ResourceDropdown
                    │ (UI Update)   │
                    └───────────────┘
```

1. Application initializes
2. ResourceService loads resource data
3. API endpoints are called to fetch resource definitions and counts
4. Resource data is processed and categorized
5. ResourceDropdowns component receives the categorized data
6. ResourceDropdown components render the resources by category

### Resource Selection Flow

```
┌──────────────┐    ┌───────────────┐    ┌────────────────┐
│ResourceDropdown───►│ Click Handler │───►│ Set Selected   │
└──────────────┘    └───────────────┘    │   Resource     │
                                         └────────────────┘
                                                │
                                                ▼
                                         ┌────────────────┐
                                         │ResourceDetails │
                                         │    Modal       │
                                         └────────────────┘
```

1. User clicks on a resource in ResourceDropdown
2. Click handler captures the selected resource
3. Selected resource state is updated
4. ResourceDetailsModal is shown with the selected resource details

## Resource Visualization in 3D World

The ResourceDisplayManager handles the visualization of resources in the 3D world:

1. **Resource Markers**: Creates 3D markers for resource locations
2. **Resource Clustering**: Groups nearby resources to improve performance
3. **Resource Selection**: Handles selection of resources in the 3D world
4. **Resource Information**: Shows tooltips and information panels for resources

## Caching Strategy

The ResourceService implements a multi-level caching strategy:

1. **In-Memory Cache**: Stores resource data in memory for immediate access
2. **Session Storage**: Persists resource data across page refreshes
3. **Cache Invalidation**: Automatically refreshes data at regular intervals
4. **Manual Refresh**: Allows forced refresh of resource data

## Error Handling

The resource management system implements robust error handling:

1. **API Error Handling**: Gracefully handles API failures with fallbacks
2. **Missing Resources**: Provides default values for missing resource properties
3. **Icon Loading Errors**: Implements fallback icons when resource icons fail to load
4. **Empty Categories**: Handles empty resource categories gracefully

## Performance Considerations

Several optimizations ensure good performance:

1. **Resource Grouping**: Resources are grouped by category and subcategory
2. **Lazy Loading**: Resource details are loaded only when needed
3. **Throttled Updates**: UI updates are throttled during resource data refresh
4. **Efficient Rendering**: ResourceDropdown uses efficient rendering techniques
5. **Icon Optimization**: Resource icons are optimized for quick loading

## Future Extensions

The resource management system is designed for future expansion:

1. **Resource Crafting**: System for crafting resources from other resources
2. **Resource Trading**: Player-to-player resource trading
3. **Resource Production**: Automated resource production from buildings
4. **Resource Consumption**: Resource consumption by citizens and buildings
5. **Resource Quality**: Variable quality levels for resources
6. **Resource Markets**: Market system for buying and selling resources
7. **Resource Expeditions**: Special missions to gather rare resources
