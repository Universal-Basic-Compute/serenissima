# La Serenissima Architecture

This document outlines the target architecture for La Serenissima, a 3D interactive experience of Renaissance Venice with blockchain integration.

## Architecture Principles

1. **Separation of Concerns**: Each component should have a single responsibility
2. **Dependency Inversion**: High-level modules should not depend on low-level modules
3. **Clean Interfaces**: Components should communicate through well-defined interfaces
4. **Event-Driven Communication**: Use events for loose coupling between components
5. **Centralized State Management**: Single source of truth for application state
6. **Progressive Enhancement**: Core functionality works without advanced features
7. **Resilient Error Handling**: Graceful degradation when errors occur

## Architecture Layers

The application is organized into the following layers:

1. **UI Layer**: React components for user interface
2. **Service Layer**: Business logic and data access
3. **State Management**: Centralized state store
4. **Event System**: Communication between components
5. **3D Rendering**: Three.js integration and rendering logic
6. **Blockchain Integration**: Wallet connection and token management

## Directory Structure

```
/
├── app/                # Next.js app directory
│   ├── api/            # API routes
│   └── pages/          # Page components
├── components/         # React components
│   ├── UI/             # Generic UI components
│   └── PolygonViewer/  # 3D viewer components
├── lib/                # Shared utilities and services
│   ├── services/       # Service layer
│   ├── threejs/        # Three.js abstractions
│   └── blockchain/     # Blockchain utilities
├── store/              # State management
├── types/              # TypeScript type definitions
└── public/             # Static assets
```

## Key Architectural Components

See the following documents for detailed information on each architectural component:

- [Component Architecture](./components.md)
- [Service Layer](./services.md)
- [State Management](./state-management.md)
- [Event System](./events.md)
- [3D Rendering](./rendering.md)
