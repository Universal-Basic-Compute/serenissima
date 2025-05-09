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
  
  /**
   * Subscribe to an event with a simpler syntax
   * @param event Event name
   * @param callback Function to call when event is emitted
   * @returns Subscription object with unsubscribe method
   */
  on(event: string, callback: Function): EventSubscription {
    return this.subscribe(event, callback);
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
  DOCK_PLACED: 'dockPlaced',
  VIEW_MODE_CHANGED: 'viewModeChanged',
  POLYGONS_LOADED: 'polygonsLoaded',
  POLYGON_DELETED: 'polygonDeleted',
  // New event types for the refactored architecture
  OWNER_COLORS_UPDATED: 'ownerColorsUpdated',
  OWNER_COAT_OF_ARMS_UPDATED: 'ownerCoatOfArmsUpdated',
  POLYGON_OWNER_UPDATED: 'polygonOwnerUpdated',
  // Building and infrastructure events
  DOCK_DELETED: 'dockDeleted',
  DOCK_UPDATED: 'dockUpdated',
  DOCK_SELECTED: 'dockSelected',
  DOCK_HOVER: 'dockHover',
  // Interaction events
  INTERACTION_CLICK: 'interactionClick',
  INTERACTION_MOUSE_DOWN: 'interactionMouseDown',
  INTERACTION_MOUSE_MOVE: 'interactionMouseMove',
  INTERACTION_DRAG: 'interactionDrag',
  INTERACTION_DRAG_END: 'interactionDragEnd',
  POLYGON_UPDATED: 'polygonUpdated',
  // Income data events
  INCOME_DATA_UPDATED: 'incomeDataUpdated',
  POLYGON_INCOME_UPDATED: 'polygonIncomeUpdated',
  // Transaction events
  TRANSACTION_CREATED: 'transactionCreated',
  TRANSACTION_EXECUTED: 'transactionExecuted',
  // Marketplace events
  LISTING_CREATED: 'listingCreated',
  LISTING_CANCELLED: 'listingCancelled',
  OFFER_CREATED: 'offerCreated',
  OFFER_ACCEPTED: 'offerAccepted',
  OFFER_REJECTED: 'offerRejected',
  // Loan events
  LOAN_PAYMENT_MADE: 'loanPaymentMade',
  LOAN_APPLIED: 'loanApplied',
  LOAN_PAID_OFF: 'loanPaidOff',
  // Citizen events
  CITIZEN_SELECTED: 'citizenSelected',
  CITIZEN_HOVER: 'citizenHover',
  CITIZENS_LOADED: 'citizensLoaded',
  SHOW_CITIZEN_DETAILS: 'showCitizenDetails',
  CITIZEN_DETAILS_CLOSED: 'citizenDetailsClosed',
  CITIZEN_ADDED: 'citizenAdded',
  CITIZEN_REMOVED: 'citizenRemoved',
  
  // Transport events
  SHOW_TOOLTIP: 'showTooltip',
  HIDE_TOOLTIP: 'hideTooltip',
  PATH_CALCULATED: 'pathCalculated',
  BRIDGE_SELECTED: 'bridgeSelected',
  TRANSPORT_DOCK_SELECTED: 'transportDockSelected',
  
  // Resource events
  RESOURCE_ADDED: 'resourceAdded',
  RESOURCE_REMOVED: 'resourceRemoved',
  SHOW_RESOURCE_DETAILS: 'showResourceDetails'
};
