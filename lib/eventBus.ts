/**
 * A simple event bus implementation to decouple components
 */
export interface EventSubscription {
  unsubscribe: () => void;
}

export class EventBus {
  private listeners: Record<string, Function[]> = {};

  /**
   * Subscribe to an event
   * @param event Event name
   * @param callback Function to call when event is emitted
   * @returns Subscription object with unsubscribe method
   */
  subscribe(event: string, callback: Function): EventSubscription {
    if (!this.listeners[event]) {
      this.listeners[event] = [];
    }
    this.listeners[event].push(callback);
    
    return {
      unsubscribe: () => this.unsubscribe(event, callback)
    };
  }

  /**
   * Unsubscribe from an event
   * @param event Event name
   * @param callback Function to remove from listeners
   */
  private unsubscribe(event: string, callback: Function): void {
    if (this.listeners[event]) {
      this.listeners[event] = this.listeners[event].filter(cb => cb !== callback);
    }
  }

  /**
   * Emit an event with optional data
   * @param event Event name
   * @param data Optional data to pass to listeners
   */
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

// Define event types for better type safety
export const EventTypes = {
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
  POLYGON_DELETED: 'polygonDeleted'
};
