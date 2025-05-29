/**
 * UIStateService
 * Manages UI state like panel visibility and selection states
 */

import { eventBus, EventTypes } from '../utils/eventBus';

export class UIStateService {
  private selectedPolygonId: string | null = null;
  private showLandDetailsPanel: boolean = false;
  private selectedBuildingId: string | null = null;
  private showBuildingDetailsPanel: boolean = false;
  private selectedCitizen: any = null;
  private showCitizenDetailsPanel: boolean = false;
  
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
    selectedPolygonId: string | null;
    showLandDetailsPanel: boolean;
    selectedBuildingId: string | null;
    showBuildingDetailsPanel: boolean;
    selectedCitizen: any;
    showCitizenDetailsPanel: boolean;
  } {
    return {
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
