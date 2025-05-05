# Component Architecture

La Serenissima uses a component-based architecture with React. Components are organized by responsibility and follow a hierarchical structure.

## Component Categories

1. **Page Components**: Top-level components that represent entire pages
2. **Feature Components**: Components that implement specific features
3. **UI Components**: Reusable UI elements
4. **3D Components**: Components related to 3D rendering

## Component Hierarchy

```
App
├── Map (Page)
│   ├── PolygonViewer (Feature)
│   │   ├── SceneSetup
│   │   ├── PolygonRenderer
│   │   ├── CloudSystem
│   │   ├── SimpleWater
│   │   └── ViewModeMenu
│   ├── LandDetailsPanel (Feature)
│   ├── MarketPanel (Feature)
│   ├── BuildingMenu (Feature)
│   └── WalletStatus (UI)
└── Other Pages...
```

## Component Responsibilities

### Page Components

- Handle routing and page-level state
- Compose feature components
- Manage page-level effects and lifecycle

### Feature Components

- Implement specific application features
- Manage feature-specific state
- Communicate with services and state management
- Delegate data persistence to service layer

### UI Components

- Provide reusable UI elements
- Accept props for customization
- Maintain internal state when necessary
- Should be presentational and not contain business logic

### 3D Components

- Handle 3D rendering and interaction
- Encapsulate Three.js functionality through facade pattern
- Communicate through well-defined interfaces
- Separate business logic from rendering details

#### Facade Pattern Implementation

The 3D components use the facade pattern to hide Three.js complexity:

1. **Facade Classes**: Provide simplified interfaces to Three.js functionality
   - `SceneFacade`: Manages scene, camera, renderer, and animation loop
   - `InteractionFacade`: Handles raycasting and object selection
   - `RenderingFacade`: Manages rendering pipeline and post-processing

2. **Manager Classes**: Use facades to implement higher-level functionality
   - `InteractionManager`: Uses `InteractionFacade` for user interaction
   - `PolygonRenderer`: Uses rendering facades for polygon visualization
   - `RoadCreationManager`: Uses facades for road creation UI

## Component Communication

Components should communicate through:

1. **Props**: For parent-child communication
2. **Event Bus**: For communication between unrelated components
3. **State Management**: For shared state
4. **Service Layer**: For business logic and data access

## Component Design Guidelines

1. **Single Responsibility**: Each component should do one thing well
2. **Prop Validation**: Use TypeScript interfaces for prop validation
3. **Controlled Components**: Prefer controlled components over uncontrolled
4. **Error Boundaries**: Use error boundaries to prevent cascading failures
   - Wrap complex components with error boundaries
   - Provide meaningful fallback UIs
   - Log errors for debugging
   - Allow users to retry or recover from errors
5. **Performance Optimization**: Use memoization and virtualization when appropriate
6. **Accessibility**: Ensure components are accessible
7. **Separation of Concerns**: Separate presentation from business logic
   - Use custom hooks for data fetching and state management
   - Keep components focused on rendering
   - Move complex logic out of components
