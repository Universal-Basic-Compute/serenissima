/**
 * UIStateService
 * Manages UI state like panel visibility and hover states
 */

import { eventBus, EventTypes } from '../utils/eventBus';
import { assetService } from './AssetService';

// Add these to EventTypes
EventTypes.BUILDING_HOVER_STATE_CHANGED = 'BUILDING_HOVER_STATE_CHANGED';
EventTypes.BUILDING_IMAGE_LOADING_STATE_CHANGED = 'BUILDING_IMAGE_LOADING_STATE_CHANGED';

export class UIStateService {
  private hoveredBuildingName: string | null = null;
  private hoveredBuildingPosition: {x: number, y: number} | null = null;
  private hoveredBuildingImagePath: string | null = null;
  private isLoadingBuildingImage: boolean = false;
  
  private selectedPolygonId: string | null = null;
  private showLandDetailsPanel: boolean = false;
  private selectedBuildingId: string | null = null;
  private showBuildingDetailsPanel: boolean = false;
  private selectedCitizen: any = null;
  private showCitizenDetailsPanel: boolean = false;
  
  /**
   * Set building hover state
   */
  public setBuildingHover(
    buildingName: string | null,
    position: {x: number, y: number} | null,
    imagePath: string | null
  ): void {
    // Skip the update entirely if all values are null
    if (buildingName === null && position === null && imagePath === null) {
      // Only emit an event if we're clearing a previous non-null state
      if (this.hoveredBuildingName !== null || this.hoveredBuildingPosition !== null || this.hoveredBuildingImagePath !== null) {
        this.hoveredBuildingName = null;
        this.hoveredBuildingPosition = null;
        this.hoveredBuildingImagePath = null;
        
        // Emit event with null values
        eventBus.emit(EventTypes.BUILDING_HOVER_STATE_CHANGED, {
          buildingName: null,
          position: null,
          imagePath: null
        });
      }
      return;
    }
    
    // Use simple equality checks to avoid deep comparisons that might cause issues
    const nameChanged = this.hoveredBuildingName !== buildingName;
    const positionChanged = 
      (!this.hoveredBuildingPosition && position) || 
      (this.hoveredBuildingPosition && !position) ||
      (this.hoveredBuildingPosition && position && 
       (this.hoveredBuildingPosition.x !== position.x || 
        this.hoveredBuildingPosition.y !== position.y));
    const imagePathChanged = this.hoveredBuildingImagePath !== imagePath;
    
    // Only update and emit if something actually changed
    if (nameChanged || positionChanged || imagePathChanged) {
      // Create a copy of the current state for comparison
      const prevName = this.hoveredBuildingName;
      const prevPosition = this.hoveredBuildingPosition;
      const prevImagePath = this.hoveredBuildingImagePath;
      
      // Update state first
      this.hoveredBuildingName = buildingName;
      this.hoveredBuildingPosition = position;
      this.hoveredBuildingImagePath = imagePath;
      
      // Log the state change for debugging
      console.log('UIStateService: Building hover state changed', {
        from: { name: prevName, position: prevPosition, imagePath: prevImagePath },
        to: { name: buildingName, position, imagePath }
      });
      
      // Then emit event
      eventBus.emit(EventTypes.BUILDING_HOVER_STATE_CHANGED, {
        buildingName,
        position,
        imagePath
      });
    }
  }
  
  /**
   * Set loading building image state
   */
  public setLoadingBuildingImage(isLoading: boolean): void {
    this.isLoadingBuildingImage = isLoading;
    
    // Emit event
    eventBus.emit(EventTypes.BUILDING_IMAGE_LOADING_STATE_CHANGED, {
      isLoading
    });
  }
  
  /**
   * Fetch and set building image path
   */
  public async fetchBuildingImagePath(buildingType: string, variant?: string): Promise<void> {
    try {
      this.setLoadingBuildingImage(true);
      
      // Use AssetService to get the building image path
      const imagePath = await assetService.getBuildingImagePath(buildingType, variant);
      
      // Only update if we're still hovering over the same building
      if (this.hoveredBuildingName) {
        // Update UI state with the image path
        this.setBuildingHover(
          this.hoveredBuildingName,
          this.hoveredBuildingPosition,
          imagePath
        );
      }
    } catch (error) {
      console.error('Error fetching building image path:', error);
      if (this.hoveredBuildingName) {
        this.setBuildingHover(
          this.hoveredBuildingName,
          this.hoveredBuildingPosition,
          '/images/buildings/market_stall.jpg'
        );
      }
    } finally {
      this.setLoadingBuildingImage(false);
    }
  }
  
  /**
   * Set selected polygon state
   */
  public setSelectedPolygon(polygonId: string | null, showPanel: boolean = true): void {
    this.selectedPolygonId = polygonId;
    this.showLandDetailsPanel = showPanel;
    
    // Emit event
    eventBus.emit(EventTypes.POLYGON_SELECTED, {
      polygonId,
      showPanel
    });
  }
  
  /**
   * Set selected building state
   */
  public setSelectedBuilding(buildingId: string | null, showPanel: boolean = true): void {
    this.selectedBuildingId = buildingId;
    this.showBuildingDetailsPanel = showPanel;
    
    // Emit event
    eventBus.emit(EventTypes.BUILDING_SELECTED, {
      buildingId,
      showPanel
    });
  }
  
  /**
   * Set selected citizen state
   */
  public setSelectedCitizen(citizen: any | null, showPanel: boolean = true): void {
    this.selectedCitizen = citizen;
    this.showCitizenDetailsPanel = showPanel;
    
    // Emit event
    eventBus.emit(EventTypes.CITIZEN_SELECTED, citizen);
  }
  
  /**
   * Handle building hover
   */
  public handleBuildingHover(buildingId: string | null, building: any | null, position: {x: number, y: number} | null): void {
    // Import uiStateService here to avoid circular dependency
    const { uiStateService } = require('./UIStateService');
    
    // If clearing hover state, just call setBuildingHover with null values
    if (!buildingId || !building) {
      uiStateService.setBuildingHover(null, null, null);
      return;
    }
    
    // Only update the name and position, but don't fetch the image here
    // This prevents circular updates when the image path changes
    const buildingName = building.name || building.type;
    
    // Check if the name or position has changed before updating
    if (this.hoveredBuildingName !== buildingName || 
        !this.hoveredBuildingPosition || 
        position.x !== this.hoveredBuildingPosition.x || 
        position.y !== this.hoveredBuildingPosition.y) {
      
      // Update the name and position, but keep the existing image path
      uiStateService.setBuildingHover(
        buildingName,
        position,
        this.hoveredBuildingImagePath // Keep existing image path
      );
      
      // Store the values locally too
      this.hoveredBuildingName = buildingName;
      this.hoveredBuildingPosition = position;
      
      // Fetch the image separately, but only if we don't already have one
      if (!this.hoveredBuildingImagePath && !this.isLoadingBuildingImage) {
        uiStateService.fetchBuildingImagePath(building.type, building.variant);
      }
    }
  }
  
  /**
   * Get the current UI state
   */
  public getState(): {
    hoveredBuildingName: string | null;
    hoveredBuildingPosition: {x: number, y: number} | null;
    hoveredBuildingImagePath: string | null;
    isLoadingBuildingImage: boolean;
    selectedPolygonId: string | null;
    showLandDetailsPanel: boolean;
    selectedBuildingId: string | null;
    showBuildingDetailsPanel: boolean;
    selectedCitizen: any;
    showCitizenDetailsPanel: boolean;
  } {
    return {
      hoveredBuildingName: this.hoveredBuildingName,
      hoveredBuildingPosition: this.hoveredBuildingPosition,
      hoveredBuildingImagePath: this.hoveredBuildingImagePath,
      isLoadingBuildingImage: this.isLoadingBuildingImage,
      selectedPolygonId: this.selectedPolygonId,
      showLandDetailsPanel: this.showLandDetailsPanel,
      selectedBuildingId: this.selectedBuildingId,
      showBuildingDetailsPanel: this.showBuildingDetailsPanel,
      selectedCitizen: this.selectedCitizen,
      showCitizenDetailsPanel: this.showCitizenDetailsPanel
    };
  }
}

// Export a singleton instance
export const uiStateService = new UIStateService();
