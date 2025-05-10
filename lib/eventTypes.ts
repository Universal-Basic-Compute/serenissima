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
  BUILDING_REMOVED: 'buildingRemoved',
  BUILDING_UPDATED: 'buildingUpdated',
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
  POLYGON_OWNER_UPDATED: 'polygonOwnerUpdated',
  WATER_NAVIGATION_UPDATED: 'waterNavigationUpdated',
  
  // Building-specific events
  BUILDING_SELECTED: 'buildingSelected',
  BUILDING_HOVER: 'buildingHover',
  BUILDING_CONSTRUCTION_STARTED: 'buildingConstructionStarted',
  BUILDING_CONSTRUCTION_COMPLETED: 'buildingConstructionCompleted',
  BUILDING_INCOME_GENERATED: 'buildingIncomeGenerated',
  BUILDING_DAMAGED: 'buildingDamaged',
  BUILDING_REPAIRED: 'buildingRepaired',
  BUILDING_UPGRADED: 'buildingUpgraded',
  BUILDING_DEMOLISHED: 'buildingDemolished',
  BUILDING_MAINTENANCE_DUE: 'buildingMaintenanceDue',
  BUILDING_MAINTENANCE_PAID: 'buildingMaintenancePaid',
  BUILDING_MAINTENANCE_MISSED: 'buildingMaintenanceMissed',
  BUILDING_OWNERSHIP_CHANGED: 'buildingOwnershipChanged',
  
  // UI tooltip events
  SHOW_TOOLTIP: 'showTooltip',
  HIDE_TOOLTIP: 'hideTooltip'
};
