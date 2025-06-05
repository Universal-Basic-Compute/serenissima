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
  // Polygon events
  POLYGON_SELECTED: 'polygonSelected',
  POLYGON_HOVER: 'polygonHover',
  LAND_OWNERSHIP_CHANGED: 'landOwnershipChanged',
  POLYGONS_LOADED: 'polygonsLoaded',
  POLYGON_DELETED: 'polygonDeleted',
  POLYGON_UPDATED: 'polygonUpdated',
  POLYGON_OWNER_UPDATED: 'polygonOwnerUpdated',
  LAND_MARKER_SETTINGS_UPDATED: 'landMarkerSettingsUpdated', // For LandMarkers custom image settings
    
  // Building events
  BUILDING_PLACED: 'buildingPlaced',
  BUILDING_SELECTED: 'buildingSelected',
  BUILDING_HOVER: 'buildingHover',
  BUILDING_HOVER_STATE_CHANGED: 'BUILDING_HOVER_STATE_CHANGED',
  BUILDING_IMAGE_LOADING_STATE_CHANGED: 'BUILDING_IMAGE_LOADING_STATE_CHANGED',
  BUILDING_REMOVED: 'BUILDING_REMOVED',
  BUILDING_UPDATED: 'BUILDING_UPDATED',
  BUILDING_POINTS_GENERATED: 'BUILDING_POINTS_GENERATED',
  BUILDING_POINTS_LOADED: 'BUILDING_POINTS_LOADED',
  BUILDING_POINT_SELECTED: 'BUILDING_POINT_SELECTED',
  BUILDING_POSITIONS_CALCULATED: 'BUILDING_POSITIONS_CALCULATED',
    
  // Hover events
  HOVER_STATE_CHANGED: 'HOVER_STATE_CHANGED',
  
  // Citizen events
  CITIZENS_DATA_LOADED: 'citizensDataLoaded',
  CITIZEN_PROFILE_UPDATED: 'citizenProfileUpdated',
  WALLET_CHANGED: 'walletChanged',
  
  // View events
  VIEW_MODE_CHANGED: 'viewModeChanged',
  VIEWPORT_SCALE_CHANGED: 'VIEWPORT_SCALE_CHANGED',
  VIEWPORT_OFFSET_CHANGED: 'VIEWPORT_OFFSET_CHANGED',
  VIEWPORT_RESET: 'VIEWPORT_RESET',
  VIEWPORT_STATE: 'VIEWPORT_STATE',
  
  // Owner events
  OWNER_COLORS_UPDATED: 'ownerColorsUpdated',
  OWNER_COAT_OF_ARMS_UPDATED: 'ownerCoatOfArmsUpdated',
  COAT_OF_ARMS_LOADED: 'COAT_OF_ARMS_LOADED',
  
  // Interaction events
  INTERACTION_CLICK: 'interactionClick',
  INTERACTION_MOUSE_DOWN: 'interactionMouseDown',
  INTERACTION_MOUSE_MOVE: 'interactionMouseMove',
  INTERACTION_DRAG: 'interactionDrag',
  INTERACTION_DRAG_END: 'interactionDragEnd',
  
  // Income events
  INCOME_DATA_UPDATED: 'incomeDataUpdated',
  INCOME_DATA_LOADED: 'INCOME_DATA_LOADED',
  INCOME_DATA_LOADING_ERROR: 'INCOME_DATA_LOADING_ERROR',
  POLYGON_INCOME_UPDATED: 'polygonIncomeUpdated',
  
  // Transaction events
  TRANSACTION_CREATED: 'transactionCreated',
  TRANSACTION_EXECUTED: 'transactionExecuted',
  COMPUTE_BALANCE_CHANGED: 'computeBalanceChanged',
  LAND_PURCHASED: 'landPurchased',
  SHOW_LAND_PURCHASE_MODAL: 'showLandPurchaseModal',
  KEEP_LAND_DETAILS_PANEL_OPEN: 'keepLandDetailsPanelOpen',
  
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
  SHOW_CITIZEN_PANEL_EVENT: 'showCitizenPanelEvent', // Added for direct panel opening
  
  // Transport events
  TRANSPORT_MODE_CHANGED: 'TRANSPORT_MODE_CHANGED',
  TRANSPORT_PATH_CHANGED: 'TRANSPORT_PATH_CHANGED',
  TRANSPORT_POINT_SELECTED: 'TRANSPORT_POINT_SELECTED',
  TRANSPORT_CALCULATION_STARTED: 'TRANSPORT_CALCULATION_STARTED',
  TRANSPORT_CALCULATION_COMPLETED: 'TRANSPORT_CALCULATION_COMPLETED',
  TRANSPORT_CALCULATION_ERROR: 'TRANSPORT_CALCULATION_ERROR',
  SHOW_TOOLTIP: 'showTooltip',
  HIDE_TOOLTIP: 'hideTooltip',
  PATH_CALCULATED: 'pathCalculated',
  BRIDGE_SELECTED: 'bridgeSelected',
  
  // Resource events
  RESOURCE_ADDED: 'resourceAdded',
  RESOURCE_REMOVED: 'resourceRemoved',
  SHOW_RESOURCE_DETAILS: 'showResourceDetails',
  
  // Scene events
  SCENE_BASE_RENDERED: 'SCENE_BASE_RENDERED',
  
  // Data events
  DATA_LOADED: 'DATA_LOADED',
  DATA_LOADING_ERROR: 'DATA_LOADING_ERROR',

  // App State Events
  DAILY_UPDATE_PANEL_CLOSED: 'dailyUpdatePanelClosed',
  
  // Transport events
  TRANSPORT_START_POINT_SET: 'TRANSPORT_START_POINT_SET',
  TRANSPORT_END_POINT_SET: 'TRANSPORT_END_POINT_SET',
  TRANSPORT_ROUTE_CALCULATING: 'TRANSPORT_ROUTE_CALCULATING',
  TRANSPORT_ROUTE_CALCULATED: 'TRANSPORT_ROUTE_CALCULATED',
  TRANSPORT_ROUTE_ERROR: 'TRANSPORT_ROUTE_ERROR',
  TRANSPORT_RESET: 'TRANSPORT_RESET',
  REQUEST_WALLET_STATUS: 'requestWalletStatus', // Added missing event type
  WEATHER_UPDATED: 'WEATHER_UPDATED', // Added for weather updates
  AUDIO_SETTINGS_CHANGED: 'AUDIO_SETTINGS_CHANGED' // Added for audio settings changes
};
