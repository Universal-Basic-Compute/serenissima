# Event System Architecture

La Serenissima uses an event-driven architecture to enable loose coupling between components. The event system allows components to communicate without direct dependencies.

## Event System Principles

1. **Loose Coupling**: Components communicate without direct references
2. **Scalability**: Events can be handled by multiple subscribers
3. **Extensibility**: New event handlers can be added without modifying existing code
4. **Testability**: Event handling can be tested in isolation

## Event Bus Implementation

The event bus is implemented as a simple TypeScript class:

```typescript
export interface EventSubscription {
  unsubscribe: () => void;
}

export class EventBus {
  private listeners: Record<string, Function[]> = {};

  subscribe(event: string, callback: Function): EventSubscription {
    if (!this.listeners[event]) {
      this.listeners[event] = [];
    }
    this.listeners[event].push(callback);
    
    return {
      unsubscribe: () => this.unsubscribe(event, callback)
    };
  }

  private unsubscribe(event: string, callback: Function): void {
    if (this.listeners[event]) {
      this.listeners[event] = this.listeners[event].filter(cb => cb !== callback);
    }
  }

  emit(event: string, data?: any): void {
    if (this.listeners[event]) {
      this.listeners[event].forEach(callback => {
        try {
          callback(data);
        } catch (error) {
          console.error(`Error in event listener for ${event}:`, error);
        }
      });
    }
  }
}

// Create a singleton instance for global use
export const eventBus = new EventBus();
```

## Event Types

Events are defined as constants to ensure consistency:

```typescript
export const EventTypes = {
  // Domain events
  POLYGON_SELECTED: 'polygonSelected',
  POLYGON_HOVER: 'polygonHover',
  LAND_OWNERSHIP_CHANGED: 'landOwnershipChanged',
  COMPUTE_BALANCE_CHANGED: 'computeBalanceChanged',
  LAND_PURCHASED: 'landPurchased',
  SHOW_LAND_PURCHASE_MODAL: 'showLandPurchaseModal',
  KEEP_LAND_DETAILS_PANEL_OPEN: 'keepLandDetailsPanelOpen',
  USERS_DATA_LOADED: 'usersDataLoaded',
  USER_PROFILE_UPDATED: 'userProfileUpdated',
  WALLET_CHANGED: 'walletChanged',
  BUILDING_PLACED: 'buildingPlaced',
  VIEW_MODE_CHANGED: 'viewModeChanged',
  POLYGONS_LOADED: 'polygonsLoaded',
  POLYGON_DELETED: 'polygonDeleted',
  
  // UI interaction events
  INTERACTION_CLICK: 'interactionClick',
  INTERACTION_MOUSE_DOWN: 'interactionMouseDown',
  INTERACTION_MOUSE_MOVE: 'interactionMouseMove',
  INTERACTION_DRAG: 'interactionDrag',
  INTERACTION_DRAG_END: 'interactionDragEnd',
  
  // Rendering events
  OWNER_COLORS_UPDATED: 'ownerColorsUpdated',
  OWNER_COAT_OF_ARMS_UPDATED: 'ownerCoatOfArmsUpdated',
  POLYGON_OWNER_UPDATED: 'polygonOwnerUpdated'
};
```

## Event Subscription

Components subscribe to events using the `subscribe` method:

```typescript
useEffect(() => {
  const subscription = eventBus.subscribe(EventTypes.POLYGON_SELECTED, (data) => {
    console.log('Polygon selected:', data.polygonId);
    // Handle the event
  });
  
  return () => {
    subscription.unsubscribe();
  };
}, []);
```

## Event Emission

Components emit events using the `emit` method:

```typescript
const handlePolygonClick = (id) => {
  eventBus.emit(EventTypes.POLYGON_SELECTED, { polygonId: id });
};
```

## Event Data

Events should include all necessary data for handlers:

```typescript
// Good event data
eventBus.emit(EventTypes.LAND_OWNERSHIP_CHANGED, {
  landId: 'polygon-123',
  newOwner: 'user-456',
  previousOwner: 'user-789',
  timestamp: Date.now()
});

// Bad event data (missing context)
eventBus.emit(EventTypes.LAND_OWNERSHIP_CHANGED, {
  landId: 'polygon-123',
  newOwner: 'user-456'
});
```

## Event Handling Best Practices

1. **Keep Handlers Small**: Event handlers should be focused and concise
2. **Error Handling**: Always handle errors in event handlers
3. **Unsubscribe**: Always unsubscribe from events when components unmount
4. **Avoid Circular Events**: Be careful not to create circular event chains
5. **Performance**: Be mindful of performance in event handlers

## Event Documentation

Each event should be documented with:

1. **Purpose**: What the event represents
2. **Data Structure**: What data is included with the event
3. **Emitters**: Which components emit this event
4. **Handlers**: Which components handle this event
5. **Example**: Example usage

Example:

```typescript
/**
 * LAND_OWNERSHIP_CHANGED
 * 
 * Emitted when the ownership of a land polygon changes.
 * 
 * Data:
 * - landId: string - The ID of the land polygon
 * - newOwner: string - The ID of the new owner
 * - previousOwner: string | null - The ID of the previous owner, or null if there was no previous owner
 * - timestamp: number - The timestamp of the change
 * 
 * Emitters:
 * - LandDetailsPanel
 * - MarketPanel
 * - TransactionService
 * 
 * Handlers:
 * - PolygonRenderer
 * - LandDetailsPanel
 * - UserProfile
 * 
 * Example:
 * eventBus.emit(EventTypes.LAND_OWNERSHIP_CHANGED, {
 *   landId: 'polygon-123',
 *   newOwner: 'user-456',
 *   previousOwner: 'user-789',
 *   timestamp: Date.now()
 * });
 */
```

### Interaction Events

```typescript
/**
 * INTERACTION_CLICK
 * 
 * Emitted when a user clicks in the 3D scene.
 * 
 * Data:
 * - x: number - The client X coordinate of the click
 * - y: number - The client Y coordinate of the click
 * - button: number - The mouse button used (0 = left, 1 = middle, 2 = right)
 * 
 * Emitters:
 * - InteractionManager
 * 
 * Handlers:
 * - PolygonViewer
 * - BuildingPlacer
 * - RoadCreationManager
 * 
 * Example:
 * eventBus.emit(EventTypes.INTERACTION_CLICK, {
 *   x: 250,
 *   y: 300,
 *   button: 0
 * });
 */

/**
 * INTERACTION_DRAG
 * 
 * Emitted when a user drags in the 3D scene.
 * 
 * Data:
 * - x: number - The current client X coordinate
 * - y: number - The current client Y coordinate
 * - startX: number - The starting X coordinate of the drag
 * - startY: number - The starting Y coordinate of the drag
 * 
 * Emitters:
 * - InteractionManager
 * 
 * Handlers:
 * - CameraController
 * - SelectionBox
 * 
 * Example:
 * eventBus.emit(EventTypes.INTERACTION_DRAG, {
 *   x: 300,
 *   y: 350,
 *   startX: 250,
 *   startY: 300
 * });
 */
```
