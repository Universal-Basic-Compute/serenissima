/**
 * UIStateService
 * Manages UI state like panel visibility and hover states
 */

import { eventBus, EventTypes } from '../utils/eventBus';

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
    this.hoveredBuildingName = buildingName;
    this.hoveredBuildingPosition = position;
    this.hoveredBuildingImagePath = imagePath;
    
    // Emit event
    eventBus.emit(EventTypes.BUILDING_HOVER_STATE_CHANGED, {
      buildingName,
      position,
      imagePath
    });
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
